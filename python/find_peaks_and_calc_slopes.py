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
        
        # Convert to DataFrame
        df = pd.DataFrame(raw_data)
        df['timestamp'] = pd.to_datetime(df['timestamp'], format='ISO8601', utc=True)
        df.set_index('timestamp', inplace=True)
        df['voltage'] = pd.to_numeric(df['voltage'])
        
        voltage_col = 'voltage'
        
        # Apply Savitzky-Golay filter (window_length must be odd)
        window_len = min(51, len(df) // 10 * 2 + 1)  # Adaptive window size, ensure odd
        
        # Handle small datasets
        if len(df) < 10:
            # For very small datasets, just use the original data
            df['voltage_smooth'] = df[voltage_col]
            sys.stderr.write(f"Warning: Dataset too small ({len(df)} points) for smoothing, using original data\n")
        elif window_len < 5:
            # Minimum window size for polyorder 3 is 5
            window_len = 5
            if len(df) < window_len:
                df['voltage_smooth'] = df[voltage_col]
                sys.stderr.write(f"Warning: Dataset too small for minimum smoothing window, using original data\n")
            else:
                df['voltage_smooth'] = savgol_filter(df[voltage_col], window_len, 3)
        else:
            df['voltage_smooth'] = savgol_filter(df[voltage_col], window_len, 3)
        
        # Find peaks (maxima) - adjust parameters for small datasets
        min_prominence = 0.1 if len(df) > 100 else 0.01
        min_distance = 20 if len(df) > 100 else max(1, len(df) // 10)
        
        peaks_idx, peak_properties = find_peaks(
            df['voltage_smooth'], 
            height=None,        # Minimum peak height (None = no limit)
            prominence=min_prominence,     # Peak must stand out by this amount
            distance=min_distance,        # Minimum samples between peaks
            width=None          # Minimum peak width
        )
        
        # Find valleys (minima) by inverting signal
        valleys_idx, valley_properties = find_peaks(
            -df['voltage_smooth'],  # Invert signal to find minima
            height=None,
            prominence=min_prominence,
            distance=min_distance,
            width=None
        )
        
        # Extract peak/valley values and timestamps
        peak_times = df.index[peaks_idx]
        peak_values = df['voltage_smooth'].iloc[peaks_idx]
        
        valley_times = df.index[valleys_idx]
        valley_values = df['voltage_smooth'].iloc[valleys_idx]
        
        # Calculate slopes from peaks to next valleys
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
                slope = voltage_diff / time_diff if time_diff != 0 else np.nan
                
                # Average time as index
                avg_time = peak_time + (valley_time - peak_time) / 2
                
                slopes.append(slope)
                slope_times.append(avg_time)
        
        # Create slopes DataFrame
        slopes_df = pd.DataFrame({
            'slope': slopes
        }, index=slope_times)
        
        # Calculate OUR (Oxygen Uptake Rate) - convert slopes to per-hour units
        our_df = -slopes_df * 60 * 60  # Convert from V/s to V/h and invert sign
        our_df.columns = ['our']  # Rename column for clarity
        
        # Calculate cumulative area under OUR curve with daily resets
        cumulative_values = []
        midnight_resets = []
        
        if len(our_df) > 0:
            # Sort by timestamp to ensure proper order
            our_df_sorted = our_df.sort_index()
            
            # Define your local timezone (adjust as needed)
            # For Montreal/Toronto: UTC-5 (EST) or UTC-4 (EDT)
            # You can change this offset based on your location
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
                    # Trapezoidal integration: area = (y1 + y2) * dt / 2
                    # But since we only have current value, we approximate with rectangular integration
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
                    "prominence": float(peak_properties['prominences'][i])
                }
                for i, (time, value) in enumerate(zip(peak_times, peak_values))
            ],
            "valleys": [
                {
                    "timestamp": time.isoformat(),
                    "value": float(value),
                    "prominence": float(valley_properties['prominences'][i])
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