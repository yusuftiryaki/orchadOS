#include "esp32_hal.h"

#include <SD.h>
#include <SPI.h>

namespace gl {

size_t UartPort::read(uint8_t* data, size_t cap) {
  const int avail = serial_.available();
  if (avail <= 0) return 0;
  const size_t n = static_cast<size_t>(avail) < cap ? avail : cap;
  return serial_.read(data, n);
}

namespace {

class SdFile : public IFile {
 public:
  explicit SdFile(fs::File f) : file_(f) {}
  ~SdFile() override { close(); }
  size_t write(const uint8_t* data, size_t len) override {
    return file_ ? file_.write(data, len) : 0;
  }
  bool flush() override {
    if (!file_) return false;
    file_.flush();
    return true;
  }
  void close() override {
    if (file_) file_.close();
  }

 private:
  fs::File file_;
};

}  // namespace

bool SdStorage::ensureMounted() {
  if (mounted_ && SD.cardType() != CARD_NONE) return true;
  if (mounted_) SD.end();
  mounted_ = SD.begin(cs_, SPI, spiHz_);
  if (mounted_ && SD.cardType() == CARD_NONE) {
    SD.end();
    mounted_ = false;
  }
  return mounted_;
}

void SdStorage::invalidate() {
  if (mounted_) SD.end();
  mounted_ = false;
}

uint64_t SdStorage::freeBytes() {
  if (!mounted_) return 0;
  const uint64_t total = SD.totalBytes();
  const uint64_t used = SD.usedBytes();
  return used >= total ? 0 : total - used;
}

bool SdStorage::exists(const char* path) { return mounted_ && SD.exists(path); }

bool SdStorage::mkdir(const char* path) { return mounted_ && SD.mkdir(path); }

std::unique_ptr<IFile> SdStorage::open(const char* path, Mode mode) {
  if (!mounted_) return nullptr;
  fs::File f = SD.open(path, mode == Mode::kAppend ? FILE_APPEND : FILE_WRITE);
  if (!f) return nullptr;
  return std::unique_ptr<IFile>(new SdFile(f));
}

}  // namespace gl
