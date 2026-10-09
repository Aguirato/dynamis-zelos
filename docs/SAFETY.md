# Hardware safety and limits

ZELOS is an experimental educational sEMG project. Neither the reference assembly nor its software has been validated as a medical device, a diagnostic instrument, or a system for deciding safe exercise loads. Follow the component manufacturers' instructions and complete the [validation procedure](VALIDATION.md) before considering human use.

## Electrical boundary

1. **Only battery-powered, wireless operation is permitted while electrodes touch a person in this reference workflow.** Disconnect USB, chargers, programmers, oscilloscopes, bench supplies, and wired connections to other equipment before placing electrodes.
2. **Remove the Wireless Shield from the Muscle Sensor before charging or programming.** This separation follows [SparkFun's Wireless Shield instructions](https://learn.sparkfun.com/tutorials/getting-started-with-the-myoware-20-muscle-sensor-ecosystem/myoware-20-wireless-shield). A laptop running on battery is not a replacement for this procedure.
3. **Never connect an electrode directly to an ESP32 or nRF GPIO, ADC, USB ground, or a generic amplifier circuit.** Use the intended biopotential sensor with its input protection. This repository does not provide a reviewed custom body-connected circuit.
4. Keep battery, connectors, and conductors protected from movement, sweat, and accidental short circuits. Use a nonconductive enclosure with strain relief and skin-compatible attachment. Stop if any component heats, swells, smells unusual, or is damaged.
5. Do not modify the supplied battery/charger pairing. Charge the detached shield following the manufacturer instructions, away from the body. Battery capacity is not a promise of a particular runtime.

The reference firmware cannot detect unsafe wiring or verify that USB is disconnected. The application safety notice is not an electrical interlock.

## Skin contact and interpretation

Use compatible disposable surface electrodes and follow their labeling. Use only on intact skin. Stop use if pain, irritation, or discomfort occurs. Do not combine this unvalidated assembly with stimulation equipment or other body-connected electronics. Questions involving an implanted device, a medical condition, or suitability for an individual require qualified advice rather than assumptions from a hobby prototype.

Electrode placement, skin contact, motion, sweat, fatigue, nearby muscles, gain, ADC clipping, and wireless loss can all alter the trace. A displayed normalized value is relative to the recorded reference, not a direct percentage of muscle strength, recruited fibers, force, or injury risk. Do not compare values across people or muscles as if they were calibrated physiological measurements.

## What the original concept images do not establish

The images communicate the intended industrial design and features. They do not establish a safe schematic, a tested enclosure, runtime, waterproofing, regulatory status, validated signal quality, simultaneous sensor capacity, or clinical benefit. The included reference prototype uses commercially available boards and differs from the pictured custom device.

Before any custom PCB or human study, obtain a qualified review of the complete input protection, leakage current paths, fault conditions, battery/charger design, materials, firmware, and intended-use requirements. The repository's software tests do not provide that review.
