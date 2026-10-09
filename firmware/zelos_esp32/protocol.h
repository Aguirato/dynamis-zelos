// DYNAMIS ZELOS reference protocol. See the repository LICENSE.
#pragma once
#include <stddef.h>
#include <stdint.h>

namespace zelos {
constexpr uint8_t kProtocolVersion = 1;
constexpr uint8_t kSamplesPerPacket = 5;
constexpr uint16_t kSampleRateHz = 1000;
constexpr size_t kPacketBytes = 20;
constexpr uint16_t kAdcMax = 4095;

inline void write16(uint8_t* out, uint16_t value) {
  out[0] = static_cast<uint8_t>(value);
  out[1] = static_cast<uint8_t>(value >> 8);
}
inline void write32(uint8_t* out, uint32_t value) {
  for (uint8_t i = 0; i < 4; ++i) out[i] = static_cast<uint8_t>(value >> (8 * i));
}

// Explicit byte encoding avoids alignment, padding, and host-endian assumptions.
// Reject an invalid ADC value instead of silently masking it.
inline bool encodePacket(uint8_t* out, size_t capacity, uint16_t sequence,
                         uint32_t firstSampleUs, const uint16_t* samples) {
  if (!out || !samples || capacity < kPacketBytes) return false;
  for (uint8_t i = 0; i < kSamplesPerPacket; ++i) {
    if (samples[i] > kAdcMax) return false;
  }
  out[0] = kProtocolVersion;
  out[1] = kSamplesPerPacket;
  write16(out + 2, sequence);
  write32(out + 4, firstSampleUs);
  write16(out + 8, kSampleRateHz);
  for (uint8_t i = 0; i < kSamplesPerPacket; ++i) write16(out + 10 + 2 * i, samples[i]);
  return true;
}
}  // namespace zelos
