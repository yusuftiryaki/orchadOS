// All pin assignments for the ESP32-WROOM-32 devkit (see README.md).
#pragma once

// ZED-F9P on ESP32 UART2 (Serial2).
constexpr int kPinGnssRx = 16;  // ESP32 RX2  <- ZED-F9P TX (UART1 TXD)
constexpr int kPinGnssTx = 17;  // ESP32 TX2  -> ZED-F9P RX (UART1 RXD)

// ZED-F9P TIMEPULSE, rising edge at the top of each GPS second.
constexpr int kPinPps = 4;

// microSD on the VSPI bus.
constexpr int kPinSdSck = 18;
constexpr int kPinSdMiso = 19;
constexpr int kPinSdMosi = 23;
constexpr int kPinSdCs = 5;

// Battery voltage through a divider (ADC1, works while BLE is active).
constexpr int kPinBattery = 34;
constexpr unsigned kBatteryDividerTopOhm = 220000;    // battery + to pin
constexpr unsigned kBatteryDividerBottomOhm = 33000;  // pin to ground

// Status LED (on-board LED of most devkits), active high.
constexpr int kPinLed = 2;
