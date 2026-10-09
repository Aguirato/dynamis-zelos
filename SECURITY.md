# Security and data handling

DYNAMIS ZELOS is an experimental local prototype. There is no supported
production release or promised security-response deadline. Security fixes
are applied to the current default branch as maintainer availability allows.

## Report a vulnerability

If private vulnerability reporting is enabled, use
[Report a vulnerability](https://github.com/Aguirato/dynamis-zelos/security/advisories/new).
If that page is unavailable, use a private contact method provided on the
[maintainer's profile](https://github.com/Aguirato). If no private channel is
listed, open a public issue asking for a private reporting channel without
including exploit details, credentials, recordings, or personal data.

Include the affected commit, software and firmware versions, minimal
reproduction steps, impact, and a proposed fix if available. Use fabricated
data to demonstrate the problem. Do not test against other people's devices
or services without their permission.

## Operating boundary

- Run the development server on your own machine for local access. Do not
  expose it to the Internet or forward its port as a shared service.
- A browser permission prompt controls which Bluetooth device the page may
  access. It does not prove that a device is genuine, validate its electrical
  safety, or guarantee confidentiality of the radio link.
- Treat nearby Bluetooth devices and received samples as untrusted inputs.
  Use only your own known devices and inspect unexpected names or behavior.
- This prototype does not claim authenticated devices, encrypted application
  packets, secure firmware updates, or protection suitable for sensitive
  health records. A commercial or clinical security assessment has not been
  performed.
- Session files and exported CSV files may contain participant-related
  information. Choose non-identifying labels and control access to saved
  files. Clearing local history does not remove CSV copies, backups,
  screenshots, or files already shared.

The app keeps saved session history in the browser's local IndexedDB store;
it does not provide cloud storage or an account system. Browser profiles and
other people with access to the same computer matter for confidentiality.
Clearing site data can remove local history. Export any wanted recordings
before clearing it, and remove exported files separately when no longer needed.

Electrical and body-contact precautions belong to the hardware instructions;
browser or Bluetooth controls cannot substitute for them. See the hardware
guide and [validation plan](docs/VALIDATION.md) before a physical experiment.
