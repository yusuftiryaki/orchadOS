// Test doubles for the HAL interfaces.
#pragma once

#include <map>
#include <memory>
#include <set>
#include <string>
#include <vector>

#include "hal.h"
#include "ubx.h"

namespace fake {

class Clock : public gl::IClock {
 public:
  uint32_t millis() override { return now; }
  void delayMs(uint32_t ms) override { now += ms; }
  uint32_t now = 0;
};

// In-memory file system.
class Storage : public gl::IStorage {
 public:
  struct File : gl::IFile {
    File(Storage* s, std::string p) : storage(s), path(std::move(p)) {}
    size_t write(const uint8_t* d, size_t n) override {
      if (storage->failWrites) return 0;
      size_t accept = n;
      if (storage->writeLimit >= 0) {
        const size_t room = static_cast<size_t>(storage->writeLimit);
        accept = n < room ? n : room;
        storage->writeLimit -= static_cast<long>(accept);
      }
      storage->files[path].append(reinterpret_cast<const char*>(d), accept);
      return accept;
    }
    bool flush() override {
      ++storage->flushes;
      return !storage->failWrites;
    }
    void close() override { closed = true; }
    Storage* storage;
    std::string path;
    bool closed = false;
  };

  bool ensureMounted() override { return present; }
  void invalidate() override { ++invalidations; }
  uint64_t freeBytes() override { return free; }
  bool exists(const char* p) override {
    return dirs.count(p) > 0 || files.count(p) > 0;
  }
  bool mkdir(const char* p) override {
    if (failMkdir) return false;
    dirs.insert(p);
    return true;
  }
  std::unique_ptr<gl::IFile> open(const char* p, Mode m) override {
    if (!present) return nullptr;
    if (m == Mode::kWrite) files[p].clear();
    return std::unique_ptr<gl::IFile>(new File(this, p));
  }

  bool present = true;
  bool failWrites = false;
  bool failMkdir = false;
  long writeLimit = -1;  // bytes accepted before writes become short
  uint64_t free = 8ull << 30;
  int flushes = 0;
  int invalidations = 0;
  std::set<std::string> dirs;
  std::map<std::string, std::string> files;
};

// Simulated receiver on a UART: only hears bytes sent at its own baud,
// answers CFG-VALSET with ACK (or NAK) and applies baud changes after ACK.
class Receiver : public gl::ISerialPort {
 public:
  explicit Receiver(uint32_t baud) : rxBaud(baud), parser_(buf_, sizeof(buf_)) {}

  void setBaud(uint32_t b) override { hostBaud = b; }
  size_t write(const uint8_t* d, size_t n) override {
    if (!alive || hostBaud != rxBaud) return n;  // garbage on the line
    for (size_t i = 0; i < n; ++i) {
      if (parser_.push(d[i]) != gl::ubx::Parser::Result::kFrame) continue;
      const auto& f = parser_.frame();
      if (f.msgClass != gl::ubx::kClassCfg || f.msgId != gl::ubx::kIdCfgValset)
        continue;
      valsets.emplace_back(f.payload, f.payload + f.length);
      const uint8_t ack[2] = {gl::ubx::kClassCfg, gl::ubx::kIdCfgValset};
      uint8_t frame[10];
      gl::ubx::buildFrame(gl::ubx::kClassAck,
                          nak ? gl::ubx::kIdAckNak : gl::ubx::kIdAckAck, ack, 2,
                          frame, sizeof(frame));
      out_.insert(out_.end(), frame, frame + sizeof(frame));
      outBaud_ = rxBaud;
      // Apply a baud key (UART1 or UART2) if present.
      for (size_t p = 4; p + 8 <= f.length;) {
        const uint32_t key = gl::ubx::readU4(f.payload + p);
        const size_t sz = key >> 28 == 4 ? 4 : key >> 28 == 3 ? 2 : 1;
        if (key == 0x40520001 || key == 0x40530001)
          pendingBaud_ = gl::ubx::readU4(f.payload + p + 4);
        p += 4 + sz;
      }
      if (pendingBaud_) {
        rxBaud = pendingBaud_;
        pendingBaud_ = 0;
      }
    }
    return n;
  }
  void flushTx() override {}
  size_t read(uint8_t* d, size_t cap) override {
    if (out_.empty() || outBaud_ != hostBaud) {
      out_.clear();
      return 0;
    }
    const size_t n = out_.size() < cap ? out_.size() : cap;
    for (size_t i = 0; i < n; ++i) d[i] = out_[i];
    out_.erase(out_.begin(), out_.begin() + n);
    return n;
  }

  uint32_t rxBaud;
  uint32_t hostBaud = 0;
  bool alive = true;
  bool nak = false;
  std::vector<std::vector<uint8_t>> valsets;

 private:
  uint8_t buf_[512];
  gl::ubx::Parser parser_;
  std::vector<uint8_t> out_;
  uint32_t outBaud_ = 0;
  uint32_t pendingBaud_ = 0;
};

}  // namespace fake
