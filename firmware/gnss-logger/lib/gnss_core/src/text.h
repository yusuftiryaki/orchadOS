// Small text helpers that do not depend on printf support for 64-bit values.
#pragma once

#include <cstdint>
#include <string>

namespace gl {

void appendInt(std::string* out, int64_t v);
void appendUint(std::string* out, uint64_t v);

// RFC 4180: quotes the field if it contains a comma, quote, CR or LF.
void appendCsvField(std::string* out, const std::string& field);

// JSON string literal including the surrounding quotes.
void appendJsonString(std::string* out, const std::string& s);

}  // namespace gl
