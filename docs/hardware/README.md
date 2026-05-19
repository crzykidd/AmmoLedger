# AmmoLedger Hardware Reference

This folder contains build instructions, configuration examples, and operator guidance for **physical hardware** that integrates with AmmoLedger.

This is *not* product spec — it's how-to-build documentation. The product spec for the features these devices interact with lives in `../prd/tagging.md`.

## Audience

- Self-hosters building their own ammunition tracking workflows with QR labels, NFC tags, and optional networked scanners.
- Contributors documenting new hardware variants or ESPHome configurations.

## Contents

- [`usb-nfc-reader.md`](./usb-nfc-reader.md) *(future)* — Supported USB NFC readers for the desktop tag-binding workflow. The ACR122U is the planned reference device.
- [`nfc-tags.md`](./nfc-tags.md) *(future)* — Supported NFC tag chips, sourcing notes, and label-stock-with-embedded-NFC options.
- [`esp32-scanner.md`](./esp32-scanner.md) — Reference build for a networked ESP32-based scanner. One canonical hardware combination with a section for community-validated alternatives.
- [`esphome-configs/`](./esphome-configs/) — ESPHome YAML configurations for various scanner roles (intake reader, bulk programmer, range-bag reader). Each example targets the canonical reference build.

## Status

The product spec in `../prd/tagging.md` documents the system at the architectural level. The hardware reference build (Waveshare ESP32-S3-Touch-LCD-2 + Elechouse PN532 V3) is the supported path. A simpler headless variant (ESP-WROOM-32 + PN532 without display) is documented as a community-validated alternative for users who don't need on-device feedback. Other hardware combinations may work but are validated by the community, not by AmmoLedger maintainers.

## Contributing

Two flavors of contribution welcome:

**Improvements to the reference build.** Found a wiring bug, a better default setting, a troubleshooting note? Open a PR against `esp32-scanner.md` or the YAML in `esphome-configs/` directly. The reference build is the canonical source of truth and corrections are valued.

**Alternative hardware that works.** Built a scanner with a different ESP32 board, a different NFC reader chip, or a different communication bus? Add an entry to the "Community-validated hardware" section at the bottom of `esp32-scanner.md`, and if you have a working YAML drop it in `esphome-configs/` with a descriptive filename. Include parts list, wiring notes, and any caveats.

## Disclaimer

Hardware mentioned in this folder is not sold or supported by AmmoLedger. Users build at their own risk and are responsible for sourcing parts, complying with local regulations, and integrating safely with their AmmoLedger installation. The maintainers do not provide hardware support beyond the reference material in this folder.
