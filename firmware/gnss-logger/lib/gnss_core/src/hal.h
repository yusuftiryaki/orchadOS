// Hardware abstraction interfaces. The ESP32 implementations live in src/hal,
// tests provide fakes.
#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>

namespace gl {

class IClock {
 public:
  virtual ~IClock() = default;
  virtual uint32_t millis() = 0;
  virtual void delayMs(uint32_t ms) = 0;
};

class ISerialPort {
 public:
  virtual ~ISerialPort() = default;
  virtual void setBaud(uint32_t baud) = 0;
  virtual size_t write(const uint8_t* data, size_t len) = 0;
  // Blocks until all queued bytes are on the wire.
  virtual void flushTx() = 0;
  // Non-blocking; returns the number of bytes read.
  virtual size_t read(uint8_t* data, size_t cap) = 0;
};

class IFile {
 public:
  virtual ~IFile() = default;
  virtual size_t write(const uint8_t* data, size_t len) = 0;
  virtual bool flush() = 0;
  virtual void close() = 0;
};

class IStorage {
 public:
  enum class Mode : uint8_t { kWrite, kAppend };

  virtual ~IStorage() = default;
  // Mounts the card if needed. False if no usable card is present.
  virtual bool ensureMounted() = 0;
  // Forgets the current mount after an I/O error so the next
  // ensureMounted() starts from scratch (card may have been swapped).
  virtual void invalidate() {}
  virtual uint64_t freeBytes() = 0;
  virtual bool exists(const char* path) = 0;
  virtual bool mkdir(const char* path) = 0;
  virtual std::unique_ptr<IFile> open(const char* path, Mode mode) = 0;
};

}  // namespace gl
