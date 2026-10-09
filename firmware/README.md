# Reference firmware

`zelos_esp32/zelos_esp32.ino` targets the **original ESP32-WROOM on the SparkFun MyoWare 2.0 Wireless Shield**. It reads MyoWare RAW on GPIO36 and sends the [ZELOS v1 BLE protocol](../docs/PROTOCOL.md). ENV on GPIO39 is deliberately not enabled: the dashboard's RAW analysis cannot be applied to an already-smoothed envelope without changes.

Read the full [hardware selection and upload guide](../docs/HARDWARE.md) and [safety procedure](../docs/SAFETY.md). **Detach the Wireless Shield from the Muscle Sensor before charging, uploading, or using USB serial.** Physical hardware validation remains required even after a successful compile.

## Build

Use Arduino CLI 1.2.2 and `esp32:esp32@3.0.7`. All BLE dependencies are bundled with that core.

```sh
arduino-cli core update-index --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core install esp32:esp32@3.0.7 --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli compile --warnings all --fqbn esp32:esp32:esp32:PartitionScheme=huge_app firmware/zelos_esp32
```

The `huge_app` partition allows space for the bundled BLE stack; this build has no over-the-air firmware update.

## Native encoder test

With a C++11 compiler, run from the repository root:

```sh
g++ -std=c++11 -Wall -Wextra -Werror firmware/tests/protocol_test.cpp -o zelos-protocol-test
./zelos-protocol-test
```

This exercises the encoder with a fixed byte vector, range and capacity rejection, null pointers, sentinel bytes, and sequence/timestamp limits. It does not emulate the radio, ADC, scheduler, or electrodes. The [firmware workflow](../.github/workflows/firmware.yml) runs this test and compiles the actual sketch.

## Acquisition design

- A microsecond timer wakes a separate acquisition task at a nominal 1 kHz. ADC reads never occur in an interrupt handler.
- Batches hold five samples; an explicitly encoded packet is 20 bytes.
- The acquisition task places packets into a bounded queue without waiting on the BLE stack. `loop()` performs notifications.
- Late timer events and large timing errors discard partial batches and create sequence gaps. Queue overflow and packet age limits also discard data rather than hiding loss.
- A connection/subscription epoch prevents queued packets from a previous session being replayed. Receiver sequence state must restart on reconnect.
- Serial statistics report local timing and loss counters; successful notification submission does not prove reception.

The implementation exposes a measurement problem instead of promising exact timing or lossless delivery. Use [VALIDATION.md](../docs/VALIDATION.md) to measure it on the intended hardware and host before recording a person.
