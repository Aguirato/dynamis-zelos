# Quickstart

Start with the simulator to learn the software. A physical sensor adds a
separate hardware, firmware, and validation workflow; it is not needed to
view, record, and export synthetic data.

## 1. Install the runtime

Install **Node.js 22 or newer**. Choose a supported LTS release from the
[official Node.js download page](https://nodejs.org/en/download) for your
operating system; its installer includes npm. On Windows, choose the
installer for your machine's architecture and follow its prompts. On macOS
or Linux, use the installation method listed for that operating system.

Open a new terminal after installation and check:

```sh
node --version
npm --version
```

The Node version must be at least `v22`. No Python environment, paid software,
global JavaScript package, or npm dependency installation is required for
the dashboard.

## 2. Get the project

With Git installed:

```sh
git clone https://github.com/Aguirato/dynamis-zelos.git
cd dynamis-zelos
```

Alternatively, open the
[GitHub repository](https://github.com/Aguirato/dynamis-zelos), choose
**Code → Download ZIP**, extract it, and open a terminal inside the extracted
folder that contains `package.json`. Do not run the application from inside
the ZIP archive.

## 3. Start the app

```sh
npm start
```

Keep that terminal open and visit **http://localhost:4173** in a browser on
the same computer. The server binds to the local loopback interface. This
setup does not serve the dashboard to another computer or phone on your Wi-Fi.

Stop the server later with **Ctrl+C**. If PowerShell blocks `npm.ps1`, use
`npm.cmd start` instead, or run the underlying command:

```sh
node scripts/serve.mjs
```

Use the local URL; opening `web/index.html` directly is not the supported
startup path.

## 4. Explore the demo

The **Signal studio** opens with four deterministic simulated channels. The
source indicator reads **DEMO · SYNTHETIC DATA**. No electrodes or Bluetooth
device are involved in this mode.

- Choose a channel using the chart's **View** selector. The chart shows the
  last three seconds of filtered signal in ADC counts.
- Use channel labels to identify a region or your own experimental condition.
  A label does not change the measured signal or identify a muscle by itself.
- Observe RMS and relative activity for each channel. The filters are simple
  first-order 20 Hz high-pass and 400 Hz low-pass stages, followed by a
  rolling 100 ms RMS window. The demo starts with an illustrative reference
  of 150 ADC counts RMS; it is not a measured participant reference.
- Use **Restart demo** to begin the deterministic simulation again. Finish
  any recording before changing the source or restarting the demo.

Synthetic demo data lets you exercise the interface. It is not a physiological
model, a reference dataset, or a prediction of a person's response.

## 5. Capture a reference

Click **Set reference** for a channel while its input is stable. The app
collects a **three-second reference** for that channel and uses the captured
RMS level for relative activity:

```text
relative activity (%) = current RMS / reference RMS × 100
```

A reference is specific to the channel, hardware, electrode arrangement, gain,
and procedure used to capture it. The control does not certify an MVC test or
provide a clinical calibration. A missing or invalid reference cannot yield
a meaningful percentage; zero must not become a divisor. Values above 100%
are possible when the current signal exceeds the reference.

For a physical experiment, define a repeatable reference procedure suitable
for that experiment with qualified guidance. The software does not instruct
participants to perform a maximal contraction.

## 6. Record, export, and compare

1. Choose your source, establish channel labels, and capture any required
   references before recording.
2. Click **Start recording**. The capture timer indicates the current session.
   Keep the tab visible and the computer awake. Do not change between the demo
   and physical devices during a recording. Labels and references are locked
   for the recording.
3. Click **Stop & save** when finished. The app saves the session in the
   current browser's local IndexedDB store. There is no pause/resume control;
   another start creates another session.
4. Click **Export CSV** to save a copy outside the browser.
5. Open **Session library** to inspect saved sessions, export a saved session,
   or check **Compare** on recordings. Summaries include sample count,
   mean RMS, peak RMS, and the count of samples at the ADC rails.

Recording stops automatically when the tab becomes hidden, a BLE device
disconnects, a BLE stream times out, or the capture limit is reached. Review
the status message before starting another session. A browser crash or
closing the process abruptly can lose an unfinished recording.

Recordings are limited to **240,000 sample rows in total across channels**.
At the nominal rate of 1,000 samples per second per channel, that is about
240 seconds for one channel, 120 seconds for two, 60 seconds for four, or
30 seconds for eight. Packet loss and actual delivery affect wall-clock
duration. Export short sessions and verify their contents before attempting
longer experiments.

History belongs to this browser profile and website origin. Switching from
`localhost` to `127.0.0.1`, changing the port, using another browser, or opening
a private window can present a different history. Clearing site data can
erase saved sessions. CSV export is the portable copy; the app does not
provide a cloud backup.

Session comparisons summarize ADC amplitudes. Different placement, skin
conditions, sensors, gain, movement artifacts, or reference procedures can
change them. Do not interpret a larger number as greater muscle strength.

### CSV fields

| Field | Meaning |
| --- | --- |
| `session_id` | Recording identifier |
| `source` | Simulation or BLE source |
| `channel`, `label` | Channel identity and user-facing description |
| `packet_sequence` | Source packet counter |
| `device_time_us` | Device sample time in microseconds, reconstructed within its connection |
| `host_elapsed_ms` | Browser elapsed time recorded with the sample |
| `raw_adc` | Unsigned 12-bit ADC sample, 0–4095 |
| `filtered_adc` | Digitally filtered amplitude in ADC counts |
| `rms_adc` | Rolling RMS in ADC counts |
| `reference_rms_adc` | Selected reference RMS, or empty when absent |
| `relative_reference_percent` | RMS relative to the reference, or empty when absent |
| `clipped` | Whether the raw sample reaches an ADC rail |

Device clocks are independent. CSV timestamps do not establish synchronized
acquisition between sensors. A rail indicator detects an ADC limit; it does
not detect every possible analog saturation or signal-quality problem.

## 7. Choose and prepare physical hardware

Read [HARDWARE](HARDWARE.md), [SAFETY](SAFETY.md), and the
[firmware instructions](../firmware/README.md) before building or connecting
a sensor. The documented reference route is:

```text
MyoWare 2.0 Muscle Sensor
    → MyoWare 2.0 Wireless Shield (ESP32)
    → ZELOS BLE firmware
    → Bluetooth adapter in your computer
    → this browser application
```

The shield routes RAW to GPIO 36 for the provided firmware. The envelope
output is not interchangeable with RAW in this processing path. Follow the
exact board revision's documented connections and power limits; the wiring
illustration is not a custom PCB manufacturing file.

**Remove the wireless shield from the muscle sensor before programming or
charging it over USB.** Flash it using the documented toolchain, disconnect
USB, and perform the no-person bench checks. Before any body-connected
experiment, complete the physical review and use the documented battery-only
assembly. A successful Bluetooth connection is not electrical validation.

## 8. Connect the sensor to the software

Use a supported desktop browser with **Web Bluetooth**, such as Chrome or
Edge on a supported Windows or macOS system, with a functioning BLE adapter.
Browser and operating-system policies can disable access. Live Bluetooth is
not supported by this project in Safari or Firefox. The demo can still be
used without Web Bluetooth. Check
[Chrome's Web Bluetooth documentation](https://developer.chrome.com/docs/capabilities/bluetooth)
and [Edge's Bluetooth access policy](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/defaultwebbluetoothguardsetting)
for platform requirements.

1. Power the prepared reference device from its documented battery supply.
2. Start the local server and open `http://localhost:4173` on the computer
   with the Bluetooth adapter. Enable Bluetooth in the operating system.
3. Finish any active recording. Click **Connect sensor** in the app. The
   browser opens its device chooser in response to that click.
4. Select your nearby `ZELOS` device and grant access. This application-level
   connection is initiated in the browser; pairing a device in the operating
   system alone does not connect it to the dashboard.
5. Confirm that the source indicates BLE, a channel appears, and samples
   arrive. Check transport health, ADC clipping, and a sensible signal before
   capturing a reference. A connected device with no samples is not ready.
6. Give the channel a useful, non-identifying label. Capture a reference if
   appropriate, then record and export a short trial.
7. To add another device, repeat **Connect sensor** and select that distinct
   device. Begin with one device and follow the [validation plan](VALIDATION.md)
   before testing two, four, or eight. Eight is an app limit, not a verified
   radio-performance guarantee.

Finish with **Stop & save**, export your recording, then click **Disconnect
all**. This disconnects the physical devices and returns the app to its demo.
After a device disconnects unexpectedly, use **Disconnect all** and connect
the intended devices again; automatic reconnection is not provided.

Web Bluetooth requires a secure context and a user gesture. The supported
development path is the local server above. A plain `http://` page on a LAN
address is not equivalent to `localhost`; publishing an HTTPS website is a
separate deployment task. See the browser vendor's documentation linked above.

The app uses a custom service and 20-byte notification format documented in
[PROTOCOL](PROTOCOL.md). A BLE heart-rate monitor, generic serial device, or
commercial EMG unit does not become compatible merely because it has Bluetooth.
It needs this protocol or an explicitly implemented adapter.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `node` or `npm` is not recognized | Install Node.js from its official site, then open a fresh terminal and recheck the versions |
| PowerShell blocks `npm.ps1` | Use `npm.cmd start` or `node scripts/serve.mjs`; no execution-policy change is needed |
| `package.json` cannot be found | Open the terminal in the extracted or cloned project folder |
| Port 4173 is already in use | Stop another copy of this app, or set a free `PORT` before starting; a different port uses a different browser storage origin |
| The page does not open | Keep the terminal running, check its error output, and open the displayed localhost URL on that same computer |
| Web Bluetooth is unavailable | Use a supported browser/OS, enable the adapter, and check browser permissions and organization policy |
| No `ZELOS` device appears | Check battery power, firmware, advertising, distance, and whether another client already holds the connection |
| Permission or chooser was cancelled | Click **Connect sensor** again when ready; cancellation is not a successful connection |
| A channel connects but shows no samples | Confirm the matching firmware, RAW input path, notification subscription, and protocol; run bench diagnostics |
| Signal is flat or clipped | Stop acquisition and review sensor power, exact signal route, input range, electrode connections, and the hardware guide; do not probe a body-connected circuit with unreviewed bench equipment |
| The percentage is missing or unexpectedly large | Check the reference; it must be valid and relevant to the current setup; values can exceed 100% |
| Packets are lost or a sensor disconnects | Reduce device count, keep the host awake and nearby, check battery state, and record the conditions; reconnect and start a new short validation session |
| History is missing | Return to the same browser profile, hostname, and port; check whether site data was cleared; use exported CSV copies |
| Saving fails or storage is full | Export the available recording and all wanted sessions, then clear this app's site data in the browser settings; this removes its local history |

To check the software installation:

```sh
npm test
npm run check
```

Read [VALIDATION](VALIDATION.md) to understand what these checks cover and
what still requires physical measurement.
