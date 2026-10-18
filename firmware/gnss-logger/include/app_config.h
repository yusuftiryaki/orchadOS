// Firmware tunables. Pins are in pins.h.
#pragma once

#include <cstddef>
#include <cstdint>

#ifndef GNSS_RAW_RATE_HZ
#define GNSS_RAW_RATE_HZ 1  // RXM-RAWX rate: 1 or 5
#endif

#ifndef GNSS_RECEIVER_UART
#define GNSS_RECEIVER_UART 1  // ZED-F9P port wired to the ESP32: 1 or 2
#endif

constexpr uint32_t kGnssBaud = 460800;
constexpr uint32_t kGnssBootBaud = 38400;  // only used to open the port
constexpr uint16_t kGnssMeasPeriodMs = 200;  // 5 Hz navigation
constexpr uint8_t kGnssPvtRateHz = 5;

// UART driver receive buffer: ~1 s of data at 5 Hz RAWX with many signals.
constexpr size_t kUartRxBufferBytes = 16384;
// Each half of the SD double buffer.
constexpr size_t kSdBufferBytes = 16384;
// The active buffer is handed to the writer at least this often; every
// write is followed by a flush, so at most ~1 s is lost on power failure.
constexpr uint32_t kSdFlushIntervalMs = 500;
constexpr uint32_t kSdSpiHz = 20000000;

// Free space is re-read this often while idle (it can be slow on big cards).
constexpr uint32_t kSdIdleRefreshMs = 30000;

constexpr uint32_t kStatusIntervalMs = 1000;
constexpr uint32_t kWatchdogTimeoutS = 15;
