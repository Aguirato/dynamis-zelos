#include "../zelos_esp32/protocol.h"
#include <assert.h>
#include <string.h>
#include <stdio.h>

int main() {
  const uint16_t samples[5] = {0, 1, 2048, 4094, 4095};
  const uint8_t expected[20] = {
    1, 5, 0x34, 0x12, 0x78, 0x56, 0x34, 0x12, 0xe8, 0x03,
    0, 0, 1, 0, 0, 8, 0xfe, 0x0f, 0xff, 0x0f
  };
  uint8_t bytes[22];
  memset(bytes, 0xa5, sizeof(bytes));
  assert(zelos::encodePacket(bytes, 20, 0x1234, 0x12345678, samples));
  assert(memcmp(bytes, expected, 20) == 0);
  assert(bytes[20] == 0xa5 && bytes[21] == 0xa5);
  assert(!zelos::encodePacket(bytes, 19, 0, 0, samples));
  assert(!zelos::encodePacket(nullptr, 20, 0, 0, samples));
  assert(!zelos::encodePacket(bytes, 20, 0, 0, nullptr));
  const uint16_t invalid[5] = {0, 4096, 2, 3, 4};
  memset(bytes, 0xa5, sizeof(bytes));
  assert(!zelos::encodePacket(bytes, 20, 0, 0, invalid));
  assert(bytes[0] == 0xa5);  // Failed validation must not emit a partial packet.
  assert(zelos::encodePacket(bytes, 20, 65535, 0xffffffffu, samples));
  assert(bytes[2] == 255 && bytes[3] == 255);
  for (int i = 4; i < 8; ++i) assert(bytes[i] == 255);
  const uint16_t next = static_cast<uint16_t>(65535u + 1u);
  assert(zelos::encodePacket(bytes, 20, next, 0, samples));
  assert(bytes[2] == 0 && bytes[3] == 0);
  puts("Firmware packet tests passed.");
}
