# Validation plan and evidence

DYNAMIS ZELOS is an experimental software and firmware prototype. A passing
software test is evidence about the tested code and inputs. It is not evidence
that a physical sensor is electrically safe, accurate, medically qualified,
or reliable during exercise. The supplied concept artwork is not a test
report or an as-built hardware specification.

## Release evidence

Local software verification on **2026-10-09**, Windows, Node.js **24.15.0**:

- `npm test`: **29 passed, 0 failed**. This includes seven controller
  integration regressions for delayed storage, discontinuities, startup
  state, clock rollover and chart timing.
- `npm run check`: passed JavaScript syntax checks.
- Browser smoke check in the Codex embedded Chromium browser: demo rendering,
  reference capture, recording/stop, session comparison, history persistence
  after reload, hardware guide navigation, and CSV download exercised.
- A downloaded synthetic CSV contained **22,920 rows across four channels**;
  its numeric range, field names and finite signal values were checked.
- Layout inspected at 390 px mobile width and 1440 px desktop width;
  the actual desktop capture is saved in `assets/dashboard.jpg`.
- No warning or error messages appeared in the inspected browser console.
- Live physical BLE pairing, electrical performance, battery endurance,
  multi-sensor radio performance and human recordings were **not tested**.

These results describe the delivered source snapshot. CI provides additional
commit-specific build results on GitHub; a configured workflow alone is not
evidence of a passing run.

GitHub Actions verification for source commit
[`641a51d`](https://github.com/Aguirato/dynamis-zelos/commit/641a51d948333dc0a80a26a80aa4f26dd539c330),
on **2026-10-09**:

| Check | Observed result | Evidence |
| --- | --- | --- |
| Software tests and syntax checks | Passed on Windows and Ubuntu with Node 22 and 24 (all four matrix jobs) | [Software checks run](https://github.com/Aguirato/dynamis-zelos/actions/runs/37925924798) |
| Native C++ packet encoder test | Passed with C++11, `-Wall -Wextra -Werror` | [Firmware run](https://github.com/Aguirato/dynamis-zelos/actions/runs/37925924892) |
| ESP32 reference sketch | Compiled successfully using Arduino CLI 1.2.2 and Espressif core 3.0.7, Huge APP partition | [Firmware build job](https://github.com/Aguirato/dynamis-zelos/actions/runs/37925924892/job/113804719075) |

The local Windows Arduino attempt was blocked by this workspace's toolchain
directory access restrictions before sketch compilation. The successful
firmware result above comes from the clean Ubuntu CI runner. No firmware was
flashed onto a physical device during this verification.

Record the tested commit, operating system, runtime, browser, command, date,
and observed result when validating a release. Never label a proposed check
as passed. The initial repository's measured software results are recorded
in its release documentation; physical and radio qualification remain
unverified unless an actual test report is added.

From the repository root, run the automated suite and start the local app:

```sh
npm test
npm start
```

Open `http://localhost:4173` and perform the relevant manual checks below.
The test command uses Node's test runner. CI results apply to the commit
shown in the CI run.

To compile the reference firmware after installing the documented Espressif
Arduino core `esp32:esp32@3.0.7`:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32:PartitionScheme=huge_app firmware/zelos_esp32
```

The initial firmware is configured for the RAW output on GPIO 36. The ENV
output is not a replacement for RAW in the app's RMS processing path.

## What each check establishes

| Area | Check and acceptance criterion | Evidence boundary |
| --- | --- | --- |
| Packet decoding | Known 20-byte packets yield the documented version, count, sequence, device timestamp, 1,000 Hz rate, and five 12-bit ADC samples; wrong length, version, count, rate, and out-of-range data are rejected | Software protocol handling only |
| Numeric processing | Fixed input vectors produce expected RMS; baseline removal and reference ratios match documented formulas within test tolerance | Arithmetic on the supplied vectors |
| Invalid input | Empty, non-finite, malformed, or unsupported inputs fail safely; no invalid percentage is displayed | The exercised error cases |
| Sequence handling | Consecutive packets, a deliberate gap, duplicate or out-of-order input, and counter wrap produce the documented result | Host detection logic; no proof of radio reliability |
| Simulation | Start, stop/save, restart, chart-channel changes, reference selection, recording, and export behave as documented | Synthetic input path only |
| CSV | Header, row count, timestamps, sample units, channel identity, and missing-data handling agree with a known short recording | Export fidelity for the tested recording |
| Bluetooth UI | Device chooser cancellation, a denied permission, an unsupported browser, disconnect, and reconnect leave understandable states | The tested browser and adapter |
| Firmware build | Compile the documented board target and dependencies without errors; record versions and warnings | Build compatibility; not correct timing or wiring |
| Firmware timing | Measure sample intervals and packet timing with a bench signal or instrumentation; record jitter and long-run rate | The tested board, firmware, settings, and conditions |
| Analog signal path | Measure offset, gain, clipping, input bandwidth, noise, and ADC behavior using a suitable isolated bench setup | The measured signal path; not inferred from marketing specifications |
| Physical system | Complete the power, isolation, connection, mechanical, and battery review in the hardware guide before body contact | Requires a qualified physical assessment and an as-built unit |
| Multiple sensors | Repeat reliability measurements at 1, 2, 4, and 8 connected devices with the exact host and adapter | Only the configurations actually tested |

## Manual software smoke test

1. Start the app and confirm that simulation is clearly identified as
   synthetic data. A demo waveform must never be presented as a live sensor.
2. Exercise the four-channel demo and each physical device count under test;
   identify every channel. Confirm
   that the UI remains readable and controls remain usable at a narrow screen
   width. No physical sensor is needed for this check.
3. Start a short session, stop it, and start another. Confirm the intended
   reset behavior, labels, elapsed time, and session boundaries.
4. Set a reference using a stable nonzero signal. Confirm that relative
   activation is described as a ratio to that reference, not strength, force,
   fatigue, motor-unit recruitment, or a universal clinical percentage.
   Repeat with zero or missing input; the app must avoid division by zero.
5. Export a short recording and inspect it in a text editor. Compare the
   number of samples and fields with the known input; check finite values,
   ordering, units, channel labels, and consistent line endings.
6. Attempt Bluetooth connection, then cancel. Check that the app recovers
   without displaying a connected sensor. Repeat after deliberately
   disconnecting a real bench device if one is available.
7. Check the browser console and server terminal for unexpected errors. Save
   only de-identified logs with the release evidence.

## Bench-to-body progression

1. **Software only:** pass the automated and simulation checks. Use generated
   samples to test decoder boundaries and data-loss behavior.
2. **No-person bench setup:** verify the exact hardware revision, signal
   routing, battery arrangement, voltage limits, and firmware configuration.
   Measure timing and analog response using suitable equipment. No person is
   connected to this setup.
3. **Physical review:** resolve the electrical and mechanical prerequisites
   in the hardware guide. A USB connection, charger, oscilloscope, or other
   bench connection can change the power and isolation arrangement. Follow
   the selected sensor manufacturer's body-contact instructions.
4. **Limited physical experiment:** only after the preceding work, document
   the approved battery-powered arrangement, informed participant permission,
   sensor placement procedure, session conditions, and observed signal
   quality. The repository does not certify this step.
5. **Expansion:** qualify each additional sensor count and exercise condition.
   Re-run relevant checks when the board, electrode, cable, enclosure,
   firmware, host adapter, sample rate, or processing changes.

Do not connect a person to an unreviewed prototype to discover whether its
electrical design is safe. This plan does not replace a qualified assessment
or the manufacturer's instructions.

## Multi-sensor and endurance report

The software may expose up to eight channels. Eight simultaneous physical
BLE devices are an experimental target, not a verified capability. Test
1, 2, 4, and 8 devices separately; do not infer the final result from one
device. Record:

- exact host OS, browser, Bluetooth adapter, firmware commit, board revision,
  channel count, sample rate, packet size, and session duration;
- expected and received packets/samples per device, detected gaps, duplicate
  packets, disconnects, reconnection behavior, and measured timing;
- distance, body orientation, movement, nearby radio activity, and battery
  state during the test; and
- power measurements and measured run time for any endurance claim.

Unless devices share a tested clock-synchronization method, their timestamps
do not establish alignment between muscles. Do not claim cross-device
latency, coordination, phase, or timing precision from independent clocks.
Do not repeat battery-life or wireless-range claims from concept images as
measured project performance.

## Suggested result record

```text
Date (UTC):
Commit:
Check:
Environment / exact hardware:
Command or procedure:
Expected result / tolerance:
Observed result:
Outcome: PASS / FAIL / NOT RUN
Evidence file or CI run:
Limits and follow-up:
```

Archive raw bench measurements alongside the report where redistribution
is permitted. Do not include personal participant information. Failed and
not-run checks remain visible so readers can distinguish implementation
progress from physical qualification.
