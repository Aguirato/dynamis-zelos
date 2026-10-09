# Roadmap

This roadmap distinguishes delivered software from proposed engineering
work. It is not a release schedule or a claim that untested hardware already
meets a target. Commercial use remains prohibited by [LICENSE](../LICENSE)
unless separately authorized in writing.

## Current release: a reproducible starting point

The repository provides a local browser dashboard, four-channel deterministic
simulation, a Web Bluetooth receiver, ESP32 reference firmware, a documented
packet format, signal-processing and transport tests, CSV export, browser
history, and English setup and hardware guides.

The software exposes at most eight device connections. Physical sensor
performance, radio capacity, battery endurance, on-body safety, and clinical
accuracy have not been established by the software implementation. The
original wearable renders do not supply an as-built PCB or enclosure.

## Stage 1: qualify one reference channel

**Work:** assemble the documented MyoWare 2.0 and ESP32 reference configuration;
verify the analog path, battery arrangement, firmware timing, and browser
delivery. Establish a repeatable, documented reference-capture procedure.

**Required evidence:** exact component revisions and firmware commit; no-person
bench measurements of sample rate, jitter, gain, noise, clipping, and bandwidth;
packet-loss records; a qualified review of the body-contact arrangement; and
a de-identified result report. Resolve failed checks before progressing.

## Stage 2: reproduce results across hosts and sessions

**Work:** test the reference device with selected browser, OS, and Bluetooth
adapter combinations; verify connection cancellation, disconnection,
reconnection, storage limits, CSV fidelity, and recovery from errors.

**Required evidence:** a compatibility matrix with versions, steps, duration,
observed failures, and explicit PASS / FAIL / NOT RUN results. Distinguish
repeatability of the digital processing from variability in the physical
measurement setup.

## Stage 3: qualify two, four, then eight devices

**Work:** increase sensor count in measured steps, review host throughput,
measure delivery gaps, and define a synchronization design if cross-muscle
timing is required.

**Required evidence:** per-device sample and packet counts, loss, timing,
disconnects, session duration, radio conditions, host configuration, and power
measurements at each device count. Independent device clocks must not be
presented as synchronized. Eight-device support is accepted only for the
configurations and conditions actually measured.

## Stage 4: engineer the custom ZELOS wearable

**Work:** evaluate the original nRF52840 direction, select and design an analog
front end and ADC, create a schematic and PCB, design protected battery power
and charging, and develop a mechanically suitable enclosure and electrode
connections. An IMU and alternative ADC resolution require explicit firmware
and protocol support.

**Required evidence:** reviewed electrical design and component limits,
manufacturing files, assembly documentation, firmware builds, signal-integrity
and timing measurements, mechanical evaluation, power and thermal measurements,
and appropriate electrical and regulatory assessments. An AD8293 label or a
24-bit ADC choice alone does not establish usable EMG performance.

## Stage 5: evaluate usability and performance claims

**Work:** define the intended research or training workflow, assess signal
quality and repeatability, and measure battery life and wireless range under
documented conditions. Evaluate any mobile expansion separately from the
desktop browser implementation.

**Required evidence:** a stated protocol, participant permissions where
applicable, appropriate review, transparent analysis, limitations, and results
that support each claimed capability. Claims about strength, fatigue,
injury prevention, diagnosis, or treatment require a separate evidentiary and
regulatory basis; none are supplied by a relative RMS display.

## Contribution priorities

Useful contributions include reproducible bench reports, browser compatibility
results, clearly labeled sample datasets with redistribution permission,
improved error recovery, measured performance improvements, accessible UI
refinements, and documented firmware ports. Follow
[CONTRIBUTING](../CONTRIBUTING.md), preserve the protocol contract, and avoid
replacing a measured limitation with an unsupported marketing claim.
