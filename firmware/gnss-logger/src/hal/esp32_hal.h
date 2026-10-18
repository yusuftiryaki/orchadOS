// ESP32 implementations of the HAL interfaces (Arduino core).
#pragma once

#include <Arduino.h>
#include <FS.h>

#include "hal.h"

namespace gl {

class ArduinoClock : public IClock {
 public:
  uint32_t millis() override { return ::millis(); }
  void delayMs(uint32_t ms) override { ::delay(ms); }
};

class UartPort : public ISerialPort {
 public:
  explicit UartPort(HardwareSerial& serial) : serial_(serial) {}
  void setBaud(uint32_t baud) override { serial_.updateBaudRate(baud); }
  size_t write(const uint8_t* data, size_t len) override {
    return serial_.write(data, len);
  }
  void flushTx() override { serial_.flush(); }
  size_t read(uint8_t* data, size_t cap) override;

 private:
  HardwareSerial& serial_;
};

// microSD card over SPI, using the Arduino SD (FAT) library.
class SdStorage : public IStorage {
 public:
  SdStorage(int cs, uint32_t spiHz) : cs_(cs), spiHz_(spiHz) {}
  bool ensureMounted() override;
  void invalidate() override;
  uint64_t freeBytes() override;
  bool exists(const char* path) override;
  bool mkdir(const char* path) override;
  std::unique_ptr<IFile> open(const char* path, Mode mode) override;

 private:
  int cs_;
  uint32_t spiHz_;
  bool mounted_ = false;
};

}  // namespace gl
