"""Pre-check and alert thresholds, in one place.

The values are the contract in docs/arayuzler.md ("Kit kaydedicisi"); they are
tuned on the real hardware, and a change is written there first.
"""

# LiDAR (Unitree L2)
LIDAR_EXPECTED_PPS = 64_000  # points per second
LIDAR_MIN_RATE_FRACTION = 0.5  # below: pre-check fails, lidar_rate_low while recording
LIDAR_SILENT_S = 3
LIDAR_RATE_WINDOW_S = 3  # points/s and IMU Hz are averaged over this window
BAG_STALL_S = 10  # MCAP not growing this long while points arrive: lidar_not_written

# Receiver
GNSS_SILENT_S = 3

# Clock
PPS_LOST_S = 1.5
CLOCK_MAX_OFFSET_US = 1000

# SSD
SSD_MIN_FREE_START_GIB = 30
SSD_LOW_GIB = 20
SSD_STOP_MIB = 512  # below: the session stops with sd_full

# Recording
FSYNC_INTERVAL_S = 1.0
BAG_SEGMENT_S = 180
