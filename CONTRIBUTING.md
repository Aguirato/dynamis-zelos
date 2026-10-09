# Contributing to DYNAMIS ZELOS

Contributions are welcome for non-commercial development of this experimental
surface-EMG platform. Read [LICENSE](LICENSE),
[docs/LICENSING.md](docs/LICENSING.md), and
[docs/VALIDATION.md](docs/VALIDATION.md) before submitting changes.

## Before opening a pull request

1. Use English for code comments, documentation, labels, issues, and release
   notes. Keep hardware part numbers and product names exact.
2. Make a focused change. Describe the problem, resulting behavior, and how
   you verified it. State explicitly if physical hardware was unavailable.
3. Run the repository's automated tests and the relevant manual checks in
   the validation guide. Include the commands and observed results.
4. For protocol changes, update the firmware, receiver, protocol documentation,
   and compatibility tests together. Do not silently reinterpret a packet or
   substitute an envelope signal for a raw EMG signal.
5. For hardware guidance, cite the manufacturer's primary documentation and
   identify the exact board and revision. Do not infer pinouts from a render.
6. Preserve the experimental status of unmeasured features. Do not claim
   electrical safety, clinical accuracy, force measurement, eight-sensor
   reliability, battery endurance, or wireless range without suitable evidence.

Use simulated or explicitly consented, de-identified example data. Do not
publish identifiable participant recordings, private device identifiers,
credentials, or personal information in issues, commits, or screenshots.
Security vulnerabilities should follow [SECURITY.md](SECURITY.md).

## Rights and attribution

By submitting a contribution, you confirm that you have the right to provide
it under the repository's non-commercial license and agree that your
contribution is distributed under that license. You retain your copyright.
Submitting a contribution does not authorize anyone's commercial use.

Identify every added third-party component or asset, link its source, preserve
its license and notices, and explain compatibility with the intended use.
Do not copy a manufacturer's schematic, SDK source, or promotional image
merely because it is publicly accessible. Prefer links when redistribution
permission has not been established.

## Useful issue details

For a software issue, include the commit, operating system, browser and
version, steps to reproduce, expected behavior, observed behavior, and
whether the source was simulation or Bluetooth. For a hardware issue, also
include the exact board revision, firmware commit, sensor output selected,
power arrangement, sample settings, and whether testing used a bench signal
or a person. Remove personal and participant data before sharing logs.
