# ZELOS BLE protocol v1

This document specifies the implemented reference firmware and browser connection. A device speaking another vendor's BLE protocol needs an adapter; Bluetooth alone does not make a sensor compatible.

| Item | Value |
| --- | --- |
| Peripheral name | `ZELOS-` followed by four hexadecimal characters |
| Service UUID | `8f7e1000-6f4b-4a3e-9e9a-3c7b2d1a0001` |
| Notify characteristic UUID | `8f7e1001-6f4b-4a3e-9e9a-3c7b2d1a0001` |
| Client configuration | Standard CCCD `0x2902`; enable notifications |
| Channel | One differential sEMG channel per BLE peripheral |
| Signal | MyoWare RAW output, unsigned 12-bit ADC counts |
| Target rate | 1,000 samples/second, five samples/notification |
| Notification size | Exactly 20 bytes |

## Packet layout

All multibyte integers use little-endian byte order. No packed C structure is sent.

| Offset | Size | Type | Meaning |
| --- | --- | --- | --- |
| 0 | 1 | `uint8` | Version, exactly `1` |
| 1 | 1 | `uint8` | Sample count, exactly `5` |
| 2 | 2 | `uint16` | Packet sequence, wraps from 65,535 to 0 |
| 4 | 4 | `uint32` | Timestamp of first ADC conversion start, microseconds since device boot, modulo 2^32 |
| 8 | 2 | `uint16` | Nominal sample rate, exactly `1000` in this implementation |
| 10 | 10 | Five `uint16` | RAW ADC readings in acquisition order, each 0–4095 |

Golden example: sequence `0x1234`, timestamp `0x12345678`, readings `[0, 1, 2048, 4094, 4095]`:

```text
01 05 34 12 78 56 34 12 e8 03 00 00 01 00 00 08 fe 0f ff 0f
```

The packet fits the 20-byte attribute payload available at the default ATT MTU of 23. The design therefore does not depend on the browser negotiating a larger MTU. A 1 kHz stream requires 200 notifications/second per device. Whether a particular operating system, adapter, connection interval, and browser can sustain that rate must be measured.

## Timing and loss

The firmware timestamps acquisition, rather than receipt by the browser. Within a packet, sample times are approximated as `firstSampleUs + i × 1000`; these are nominal times, not separately measured timestamps. The acquisition task measures actual spacing before each conversion, discards partial batches on spacing errors greater than 250 µs or accumulated timer events, and reserves a sequence number to expose the break. Smaller jitter remains possible and is recorded in serial diagnostics. Do not infer laboratory timing precision from the `1000` field.

Sequence numbers advance for complete packets before enqueueing and when a timing discontinuity invalidates a partial batch. Queue overflow, stale-packet discard, or failed delivery therefore leaves gaps. A sequence gap is a discontinuity marker; its size is not an exact lost-sample count because a discarded partial batch may contain fewer than five samples. The first received packet starts a new receiver baseline. After reconnect or reboot, reset sequence and timestamp tracking.

Use unsigned modulo arithmetic for timestamp differences. The 32-bit microsecond counter wraps about every 71.6 minutes; it is not wall-clock time. Independent sensors have independent clocks. Matching sample indexes across devices does not provide synchronization, and host arrival times are not a substitute for a synchronized clock.

## Transport behavior and scope

The firmware keeps sampling separate from notification sending, uses a bounded queue, drops packets older than 250 ms, and does not replay a previous recording after reconnect. The BLE stack's successful notification status reports acceptance, not application-level delivery. Notifications have no application acknowledgment or retransmission in v1.

v1 has no battery level, units conversion, gain metadata, control writes, device authentication, encryption requirement, clock synchronization, or over-the-air update. Record board, analog front-end, gain, and electrode placement separately. Advertised names are labels, not verified identities. Nearby centrals may connect to this experimental peripheral; see [SECURITY.md](../SECURITY.md).

Do not substitute ENV data in this protocol without extending both firmware and software: the existing analysis expects RAW samples with a DC offset. ENV has already been rectified and smoothed by the sensor and needs a different analysis path. A 24-bit front-end also requires a new encoding or an explicit, documented scaling policy; it must not be silently truncated into these 12-bit fields.

## Implementation references

- Encoder: [protocol.h](../firmware/zelos_esp32/protocol.h).
- Firmware: [zelos_esp32.ino](../firmware/zelos_esp32/zelos_esp32.ino).
- Golden-vector and bounds tests: [protocol_test.cpp](../firmware/tests/protocol_test.cpp).
- Espressif documents timer dispatch delays and the need for short callbacks in its [ESP Timer guide](https://docs.espressif.com/projects/esp-idf/en/v5.1.4/esp32/api-reference/system/esp_timer.html).
