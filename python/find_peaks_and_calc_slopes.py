#!/usr/bin/env python3
import pandas as pd
import numpy as np
import json
import sys
from scipy.signal import find_peaks, savgol_filter

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
            return {"peaks": [], "valleys": [], "slopes": [], "our_values": []}
        
        # Convert to DataFrame
        df = pd.DataFrame(raw_data)
        df['timestamp'] = pd.to_datetime(df['timestamp'], format='ISO8601', utc=True)
        df.set_index('timestamp', inplace=True)
        df['voltage'] = pd.to_numeric(df['voltage'])
        
        # # Take last 10000 points if dataset is large (matching your notebook)
        # if len(df) > 10000:
        #     df = df.tail(n=10000)
        
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
                    "value": float(our_df.loc[time, 'slope'])
                }
                for time in our_df.index
            ],
            "stats": {
                "peaks_count": len(peaks_idx),
                "valleys_count": len(valleys_idx),
                "slopes_count": len(slopes),
                "mean_slope": float(slopes_df['slope'].mean()) if len(slopes) > 0 else 0,
                "std_slope": float(slopes_df['slope'].std()) if len(slopes) > 0 else 0,
                "mean_our": float(our_df['slope'].mean()) if len(our_df) > 0 else 0,
                "std_our": float(our_df['slope'].std()) if len(our_df) > 0 else 0
            }
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            "error": str(e),
            "peaks": [],
            "valleys": [],
            "slopes": [],
            "our_values": []
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    analyze_voltage_data()