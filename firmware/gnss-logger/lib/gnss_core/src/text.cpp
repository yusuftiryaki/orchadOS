#include "text.h"

namespace gl {

void appendUint(std::string* out, uint64_t v) {
  char buf[21];
  int i = sizeof(buf);
  do {
    buf[--i] = static_cast<char>('0' + v % 10);
    v /= 10;
  } while (v != 0);
  out->append(buf + i, sizeof(buf) - i);
}

void appendInt(std::string* out, int64_t v) {
  if (v < 0) {
    out->push_back('-');
    // Negate in unsigned space so INT64_MIN does not overflow.
    appendUint(out, ~static_cast<uint64_t>(v) + 1);
  } else {
    appendUint(out, static_cast<uint64_t>(v));
  }
}

void appendCsvField(std::string* out, const std::string& f) {
  if (f.find_first_of(",\"\r\n") == std::string::npos) {
    out->append(f);
    return;
  }
  out->push_back('"');
  for (char c : f) {
    if (c == '"') out->push_back('"');
    out->push_back(c);
  }
  out->push_back('"');
}

void appendJsonString(std::string* out, const std::string& s) {
  static const char kHex[] = "0123456789abcdef";
  out->push_back('"');
  for (char ch : s) {
    const unsigned char c = static_cast<unsigned char>(ch);
    switch (c) {
      case '"': out->append("\\\""); break;
      case '\\': out->append("\\\\"); break;
      case '\n': out->append("\\n"); break;
      case '\r': out->append("\\r"); break;
      case '\t': out->append("\\t"); break;
      default:
        if (c < 0x20) {
          out->append("\\u00");
          out->push_back(kHex[c >> 4]);
          out->push_back(kHex[c & 0x0F]);
        } else {
          out->push_back(ch);
        }
    }
  }
  out->push_back('"');
}

}  // namespace gl
