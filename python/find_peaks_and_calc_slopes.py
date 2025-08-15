#!/usr/bin/env python3
import pandas as pd
import numpy as np
import json
import sys
from scipy.signal import find_peaks, savgol_filter
from datetime import datetime, timezone
from scipy import integrate

def analyze_voltage_data():
    try:
        # Read data from stdin
        input_data = sys.stdin.read().strip()
        
        # Debug: log what we received
        sys.stderr.write(f"Received input length: {len(input_data)}\n")
        sys.stderr.write(f"First 100 chars: {input_data[:100]}\n")
        
        if not input_data:
            raise ValueError("No input data received")
            
        raw_data = json.loads(input_data)
        
        if len(raw_data) == 0:
            return {"peaks": [], "valleys": [], "slopes": [], "our_values": [], "cumulative_values": []}
        
        # Convert to DataFrame - FIXED timestamp parsing
        df = pd.DataFrame(raw_data)
        df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True)  # Removed format='ISO8601' for better parsing
        df.set_index('timestamp', inplace=True)
        df['voltage'] = pd.to_numeric(df['voltage'])
        
        # Sort by timestamp to ensure proper order
        df = df.sort_index()
        
        voltage_col = 'voltage'

        min_threshold = 2
        max_threshold = 2.4
        df = df[(df['voltage'] >= min_threshold) & (df['voltage'] <= max_threshold)]
        
        # Apply Savitzky-Golay filter (window_length must be odd)
        window_len = min(51, len(df) // 10 * 2 + 1)  # Adaptive window size, ensure odd
        
        # Handle small datasets
        if len(df) < 10:
            df['voltage_smooth'] = df[voltage_col]
            sys.stderr.write(f"Warning: Dataset too small ({len(df)} points) for smoothing, using original data\n")
        elif window_len < 5:
            window_len = 5
            if len(df) < window_len:
                df['voltage_smooth'] = df[voltage_col]
                sys.stderr.write(f"Warning: Dataset too small for minimum smoothing window, using original data\n")
            else:
                df['voltage_smooth'] = savgol_filter(df[voltage_col], window_len, 3)
        else:
            df['voltage_smooth'] = savgol_filter(df[voltage_col], window_len, 3)
        
        # ADAPTIVE PARAMETERS BASED ON SIGNAL CHARACTERISTICS
        
        # Calculate rolling statistics to adapt parameters
        rolling_window = max(100, len(df) // 10)  # Adaptive rolling window
        df['voltage_rolling_std'] = df['voltage_smooth'].rolling(window=rolling_window, center=True).std()
        df['voltage_rolling_mean'] = df['voltage_smooth'].rolling(window=rolling_window, center=True).mean()
        
        # Fill NaN values at edges
        df['voltage_rolling_std'] = df['voltage_rolling_std'].fillna(df['voltage_smooth'].std())
        df['voltage_rolling_mean'] = df['voltage_rolling_mean'].fillna(df['voltage_smooth'].mean())
        
        # Split data into time segments for adaptive analysis
        time_segments = 3  # Analyze in 3 segments to detect changing patterns
        segment_size = len(df) // time_segments
        
        all_peaks_idx = []
        all_valleys_idx = []
        all_peak_properties = {'prominences': []}
        all_valley_properties = {'prominences': []}
        
        for segment in range(time_segments):
            start_idx = segment * segment_size
            end_idx = (segment + 1) * segment_size if segment < time_segments - 1 else len(df)
            
            if end_idx - start_idx < 10:  # Skip tiny segments
                continue
                
            segment_data = df.iloc[start_idx:end_idx]['voltage_smooth']
            segment_std = segment_data.std()
            segment_range = segment_data.max() - segment_data.min()
            
            # Adaptive prominence based on local signal characteristics
            # Use percentage of local standard deviation and range
            local_prominence = max(
                segment_std * 0.3,  # 30% of local std deviation
                segment_range * 0.05,  # 5% of local range
                0.005  # Minimum absolute prominence
            )
            
            # Adaptive distance based on signal frequency characteristics
            # Estimate frequency by counting zero-crossings of derivative
            segment_diff = np.diff(segment_data)
            zero_crossings = np.sum(np.diff(np.signbit(segment_diff)))
            estimated_period = len(segment_data) / max(1, zero_crossings / 2)
            local_distance = max(int(estimated_period * 0.3), 10)  # FIXED: Minimum 10 points distance
            
            sys.stderr.write(f"Segment {segment}: prominence={local_prominence:.4f}, distance={local_distance}, std={segment_std:.4f}\n")
            
            # Find peaks in this segment
            peaks_idx_segment, peak_props_segment = find_peaks(
                segment_data,
                height=None,
                prominence=local_prominence,
                distance=local_distance,
                width=None
            )
            
            # Find valleys in this segment
            valleys_idx_segment, valley_props_segment = find_peaks(
                -segment_data,
                height=None,
                prominence=local_prominence,
                distance=local_distance,
                width=None
            )
            
            # Adjust indices to global dataframe indices
            peaks_idx_segment_global = peaks_idx_segment + start_idx
            valleys_idx_segment_global = valleys_idx_segment + start_idx
            
            # Accumulate results
            all_peaks_idx.extend(peaks_idx_segment_global)
            all_valleys_idx.extend(valleys_idx_segment_global)
            all_peak_properties['prominences'].extend(peak_props_segment['prominences'])
            all_valley_properties['prominences'].extend(valley_props_segment['prominences'])
        
        # Convert to numpy arrays and sort
        peaks_idx = np.array(sorted(all_peaks_idx))
        valleys_idx = np.array(sorted(all_valleys_idx))
        
        # Reorganize properties to match sorted indices
        if len(all_peak_properties['prominences']) > 0:
            peak_prominence_dict = dict(zip(all_peaks_idx, all_peak_properties['prominences']))
            peak_properties = {'prominences': [peak_prominence_dict[idx] for idx in peaks_idx]}
        else:
            peak_properties = {'prominences': []}
            
        if len(all_valley_properties['prominences']) > 0:
            valley_prominence_dict = dict(zip(all_valleys_idx, all_valley_properties['prominences']))
            valley_properties = {'prominences': [valley_prominence_dict[idx] for idx in valleys_idx]}
        else:
            valley_properties = {'prominences': []}
        
        # FALLBACK: If adaptive method finds too few peaks, try with relaxed global parameters
        if len(peaks_idx) < 5 and len(df) > 50:  # Only if we expect more peaks
            sys.stderr.write("Adaptive method found few peaks, trying relaxed global parameters\n")
            
            global_std = df['voltage_smooth'].std()
            global_range = df['voltage_smooth'].max() - df['voltage_smooth'].min()
            
            fallback_prominence = max(global_std * 0.1, global_range * 0.02, 0.001)
            fallback_distance = max(20, len(df) // 50)  # FIXED: Increased minimum distance
            
            peaks_fallback, peak_props_fallback = find_peaks(
                df['voltage_smooth'],
                prominence=fallback_prominence,
                distance=fallback_distance
            )
            
            valleys_fallback, valley_props_fallback = find_peaks(
                -df['voltage_smooth'],
                prominence=fallback_prominence,
                distance=fallback_distance
            )
            
            if len(peaks_fallback) > len(peaks_idx):
                sys.stderr.write(f"Using fallback: found {len(peaks_fallback)} peaks vs {len(peaks_idx)}\n")
                peaks_idx = peaks_fallback
                valleys_idx = valleys_fallback
                peak_properties = peak_props_fallback
                valley_properties = valley_props_fallback
        
        # Extract peak/valley values and timestamps
        peak_times = df.index[peaks_idx]
        peak_values = df['voltage_smooth'].iloc[peaks_idx]
        
        valley_times = df.index[valleys_idx]
        valley_values = df['voltage_smooth'].iloc[valleys_idx]
        
        sys.stderr.write(f"Found {len(peaks_idx)} peaks and {len(valleys_idx)} valleys\n")
        
        # Calculate slopes from peaks to next valleys with IMPROVED logic
        slopes = []
        slope_times = []
        
        for i, peak_idx in enumerate(peaks_idx):
            peak_time = df.index[peak_idx]
            peak_val = df['voltage_smooth'].iloc[peak_idx]
            
            # Find next valley after this peak
            next_valleys = valleys_idx[valleys_idx > peak_idx]
            if len(next_valleys) > 0:
                valley_idx = next_valleys[0]  # First valley after peak
                valley_time = df.index[valley_idx]
                valley_val = df['voltage_smooth'].iloc[valley_idx]
                
                # Calculate slope: rise/run
                time_diff = (valley_time - peak_time).total_seconds()  # Convert to seconds
                voltage_diff = valley_val - peak_val
                
                # FIXED: Add validation for reasonable time differences
                if time_diff < 1 * 60:  # Less than 5 minutes
                    sys.stderr.write(f"Warning: Very short time difference: {time_diff:.1f} seconds between peak and valley\n")
                    continue
                    
                if time_diff > 7200:  # More than 2 hours
                    sys.stderr.write(f"Warning: Very long time difference: {time_diff:.1f} seconds between peak and valley\n")
                    continue
                
                slope = voltage_diff / time_diff if time_diff != 0 else np.nan
                
                # ADDED: Debug output for slope calculation
                sys.stderr.write(f"Peak {i}: {peak_val:.4f}V at {peak_time}, Valley: {valley_val:.4f}V at {valley_time}\n")
                sys.stderr.write(f"  Time diff: {time_diff:.1f}s, Voltage diff: {voltage_diff:.6f}V, Slope: {slope:.8f}V/s\n")
                
                # Average time as index
                avg_time = peak_time + (valley_time - peak_time) / 2
                
                slopes.append(slope)
                slope_times.append(avg_time)
        
        sys.stderr.write(f"Calculated {len(slopes)} valid slopes\n")
        
        # Create slopes DataFrame
        slopes_df = pd.DataFrame({
            'slope': slopes
        }, index=slope_times)
        
        # FIXED: Calculate OUR (Oxygen Uptake Rate) with proper unit conversion
        # The slope is in V/s, we need to convert to DO slope first, then to mg O2/L/h
        # DO = -10.8916 + 7.306502 * V, so dDO/dt = 7.306502 * dV/dt
        # OUR is the negative of dDO/dt (oxygen consumption), converted to per hour
        
        if len(slopes_df) > 0:
            # Convert voltage slopes to DO slopes: dDO/dt = 7.306502 * dV/dt
            do_slopes = 7.306502 * slopes_df['slope']  # mg/L per second
            
            # Convert to per hour and make positive for oxygen uptake rate
            our_values = -do_slopes * 3600  # mg O2/L/h (negative because decreasing DO = positive OUR)
            
            our_df = pd.DataFrame({'our': our_values}, index=slopes_df.index)
            
            sys.stderr.write(f"OUR range: {our_values.min():.3f} to {our_values.max():.3f} mg O2/L/h\n")
            sys.stderr.write(f"OUR mean: {our_values.mean():.3f} mg O2/L/h\n")
        else:
            our_df = pd.DataFrame({'our': []})
        
        # Calculate cumulative area under OUR curve with daily resets
        cumulative_values = []
        midnight_resets = []
        
        if len(our_df) > 0:
            # Sort by timestamp to ensure proper order
            our_df_sorted = our_df.sort_index()
            
            # Define your local timezone (adjust as needed)
            LOCAL_TIMEZONE_OFFSET_HOURS = -5  # EST (change to -4 for EDT, or adjust for your timezone)
            
            cumulative = 0
            current_day = None
            prev_time = None
            
            for timestamp, row in our_df_sorted.iterrows():
                our_value = row['our']
                
                # Convert UTC timestamp to local time for day calculation
                local_timestamp = timestamp + pd.Timedelta(hours=LOCAL_TIMEZONE_OFFSET_HOURS)
                current_date = local_timestamp.date()
                
                # Check if we've moved to a new day (reset at local midnight)
                if current_day is not None and current_date != current_day:
                    # Reset cumulative at local midnight
                    cumulative = 0
                    midnight_resets.append(timestamp.isoformat())
                    sys.stderr.write(f"Daily reset at {timestamp} (local: {local_timestamp})\n")
                
                # Calculate time difference in hours for integration
                if prev_time is not None and current_date == current_day:
                    time_diff_hours = (timestamp - prev_time).total_seconds() / 3600
                    area_increment = our_value * time_diff_hours
                    cumulative += area_increment
                
                cumulative_values.append({
                    'timestamp': timestamp.isoformat(),
                    'cumulative': float(cumulative),
                    'our_value': float(our_value)
                })
                
                current_day = current_date
                prev_time = timestamp
        
        # Calculate statistics for cumulative values
        cumulative_stats = {}
        if cumulative_values:
            cum_vals = [cv['cumulative'] for cv in cumulative_values]
            cumulative_stats = {
                'daily_resets_count': len(midnight_resets),
                'max_daily_cumulative': float(max(cum_vals)) if cum_vals else 0,
                'min_daily_cumulative': float(min(cum_vals)) if cum_vals else 0,
                'final_cumulative': float(cum_vals[-1]) if cum_vals else 0
            }
        
        # Prepare output data
        result = {
            "peaks": [
                {
                    "timestamp": time.isoformat(),
                    "value": float(value),
                    "prominence": float(peak_properties['prominences'][i]) if i < len(peak_properties['prominences']) else 0.0
                }
                for i, (time, value) in enumerate(zip(peak_times, peak_values))
            ],
            "valleys": [
                {
                    "timestamp": time.isoformat(),
                    "value": float(value),
                    "prominence": float(valley_properties['prominences'][i]) if i < len(valley_properties['prominences']) else 0.0
                }
                for i, (time, value) in enumerate(zip(valley_times, valley_values))
            ],
            "slopes": [
                {
                    "timestamp": time.isoformat(),
                    "value": float(slope)
                }
                for time, slope in zip(slope_times, slopes)
            ],
            "our_values": [
                {
                    "timestamp": time.isoformat(),
                    "value": float(our_df.loc[time, 'our'])
                }
                for time in our_df.index
            ],
            "cumulative_values": cumulative_values,
            "midnight_resets": midnight_resets,
            "stats": {
                "peaks_count": len(peaks_idx),
                "valleys_count": len(valleys_idx),
                "slopes_count": len(slopes),
                "mean_slope": float(slopes_df['slope'].mean()) if len(slopes) > 0 else 0,
                "std_slope": float(slopes_df['slope'].std()) if len(slopes) > 0 else 0,
                "mean_our": float(our_df['our'].mean()) if len(our_df) > 0 else 0,
                "std_our": float(our_df['our'].std()) if len(our_df) > 0 else 0,
                **cumulative_stats
            }
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            "error": str(e),
            "peaks": [],
            "valleys": [],
            "slopes": [],
            "our_values": [],
            "cumulative_values": [],
            "midnight_resets": []
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    analyze_voltage_data()