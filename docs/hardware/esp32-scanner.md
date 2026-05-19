# ESP32 Networked Scanner — Reference Build

**Status:** The reference build below describes the canonical hardware combination that AmmoLedger's example ESPHome configurations target. This build has not yet been physically validated end-to-end — specifics flagged as "pending first-build validation" below will be refined once the first device is assembled. Alternative hardware that other users have validated may be documented in the [Community-validated hardware](#community-validated-hardware) section at the bottom of this document.

The networked scanner architecture is described in `../prd/tagging.md` §7.

## Overview

A networked scanner is a small ESP32-based device that reads NFC tags and posts scan events to an AmmoLedger installation over the local network (or remotely via Tailscale / Cloudflare Tunnel). Each device is configured for a specific role — intake reader at the safe door, expend logger at the reloading bench, bulk programmer at the desk — and its action is either baked into firmware (pure ESPHome path) or controlled from the AmmoLedger web app (hybrid path).

The reference build pairs the **Waveshare ESP32-S3-Touch-LCD-2** development board with the **Elechouse PN532 NFC Module V3**. This combination provides a 2-inch capacitive touch display for status and mode feedback, integrated battery support for portable use, and a separate I2C-attached NFC reader for tag operations. The display is used to show scan results, current device mode, and status — making the device useful in field locations without requiring the user to consult a phone.

The supported firmware framework is [ESPHome](https://esphome.io). AmmoLedger does not publish custom firmware; users build their device using ESPHome YAML configurations.

## Reference build — bill of materials

| Component | Part | Approx. cost | Notes |
|---|---|---|---|
| Microcontroller + display | Waveshare ESP32-S3-Touch-LCD-2 (no camera) | $22 | ESP32-S3R8 (dual-core 240MHz, 8MB PSRAM, 16MB flash), 2-inch IPS 240x320 capacitive touch (ST7789T3 + CST816D), USB-C, MX1.25 lithium battery header, TF card slot, QMI8658 6-axis IMU, 22 free GPIOs broken out. WiFi + BLE 5. |
| NFC reader/writer | Elechouse PN532 NFC Module V3 | $12 | I2C / SPI / HSU selectable via DIP switches. Has on-board level shifter; tolerates 3.3V or 5V supply. Reads and writes NTAG21x and MIFARE families over ISO/IEC 14443A. |
| Wiring | Female-to-female jumper wires, 20cm, 4x minimum | $3 | More flexibility with a 40-pack. |
| Tags (consumable) | NTAG213 stickers, 25mm round | $0.20-0.40 each | Bulk packs of 50-100 are cheapest. NTAG215/216 also work but the extra capacity is unused. |

Total for the device itself: ~$37 plus stickers per tagged object.

**Optional additions:**

- 3.7V lithium battery (MX1.25 connector, ~500mAh) for portable operation. The board has charge/discharge management built in.
- Project enclosure. The Waveshare board has a tidy form factor (~58x34mm); off-the-shelf 3D-printable enclosures exist for similar Waveshare boards and may need minor adjustment.
- Piezo buzzer for audible scan confirmation (wire to any free GPIO).
- **Avoid metal enclosures** near the PN532 — they detune the antenna and collapse read range. Plastic, wood, or acrylic is fine.

## Reference build — board overview

The Waveshare ESP32-S3-Touch-LCD-2 is a self-contained development board with the ESP32-S3 module, display, touch controller, battery charging, IMU, and TF card slot all on one PCB. For this AmmoLedger use case, most of the on-board features are dormant:

- **Used:** ESP32-S3 (firmware), WiFi (server connection), display (status UI), capacitive touch (mode switching UI), USB-C (power and flashing).
- **Not used by default:** QMI8658 IMU, TF card slot, battery (unless building a portable variant).

The PN532 is wired externally via the board's broken-out GPIO header.

## Reference build — PN532 configuration

The Elechouse PN532 V3 module supports three communication buses, selected via two DIP switches on the front of the board. The silkscreen documents the settings:

```
        Switch 1   Switch 2
HSU         0          0       (factory default)
I2C         1          0       <- AmmoLedger reference uses this
SPI         0          1
```

**Set both switches to match the I2C row** (switch 1 ON, switch 2 OFF) before wiring. The factory default is HSU/UART; you will need to change it.

## Reference build — wiring

The display (ST7789T3) and touch controller (CST816D) on the Waveshare board are pre-wired internally on dedicated SPI and I2C buses, respectively. The PN532 is wired to **a separate I2C bus** on two of the board's 22 free GPIO pins.

**Pending first-build validation:** The exact GPIO assignments for the external PN532 I2C bus will be finalized once the first device is assembled. The recommended approach is:

- Use one of the ESP32-S3's free I2C-capable GPIO pairs (the board's schematic lists the full available set).
- Verify the chosen pins are not strapped to boot pins (GPIO0, GPIO45, GPIO46 on the ESP32-S3) or otherwise reserved.
- Cross-reference the Waveshare ESP32-S3-Touch-LCD-2 schematic before flashing: https://files.waveshare.com/wiki/ESP32-S3-Touch-LCD-2/ESP32-S3-Touch-LCD-2-SchDoc.pdf

A representative wiring once finalized will look like this:

```
PN532 (left edge)        Waveshare board (free GPIO header)
-----------------        ----------------------------------
GND               ---    GND
VCC               ---    3V3
SDA               ---    GPIO__  (to be finalized; second I2C bus)
SCL               ---    GPIO__  (to be finalized; second I2C bus)
```

**Optional:** The PN532 IRQ pin can be wired to a free GPIO for more reliable tag detection. Not required for a first build.

**Antenna note:** The white outlined rectangular area on the front of the PN532 board is the antenna trace. Do not enclose the PN532 in metal, and avoid placing it directly against ferrous metal surfaces — read range will collapse. Mounting behind thin plastic or wood is fine; range drops modestly but remains workable.

## Reference build — firmware

See [`esphome-configs/`](./esphome-configs/) for ESPHome YAML configurations. Each example targets this reference hardware. To use one:

1. Pair a new device in AmmoLedger settings to obtain a `device_token`.
2. Copy the relevant example YAML, substitute your WiFi credentials, server URL, and device token.
3. Flash via ESPHome (USB the first time; OTA thereafter).

**Framework choice:** ESP-IDF is recommended over Arduino for this board. The ESP32-S3 + ST7789 + display use cases benefit from ESP-IDF's tighter integration with PSRAM and the display driver. ESPHome supports both frameworks but the example configs assume ESP-IDF.

## Network requirements

- The device must be able to reach the AmmoLedger server's HTTP(S) endpoint.
- For most installs this is "same local network as the server" and is recommended.
- Remote operation via Tailscale or Cloudflare Tunnel is supported in principle, but requires a Tailscale client on the ESP32 (limited community support) or a network setup that exposes the AmmoLedger API to the device. Documented as advanced configuration not covered by this reference build.

## API

The device posts to `POST /api/scan` on the AmmoLedger server. See `../prd/tagging.md` §7.4 for the request/response schema and §7.5 for device authentication.

## First-build deliverables

This reference build will be refined as the first physical device is assembled. Specific items pending validation:

- Final GPIO assignments for the external PN532 I2C bus.
- Whether IRQ-pin wiring is necessary or just nice-to-have for reliable scan detection.
- Optimal `update_interval` for the `pn532_i2c` ESPHome component (too short interferes with display/WiFi; too long causes missed scans).
- ESPHome display configuration specifics for the ST7789T3 — Waveshare's exact init sequence may need tuning relative to the generic ST7789 driver.
- CST816D touch controller pinout — interrupt pin assignment and ESPHome `cst816` component configuration.
- Behavior when the same tag is held in the field continuously (does ESPHome fire `on_tag` once or repeatedly?). Affects debounce strategy.
- Power consumption profile if the battery option is used. Sleep/wake behavior on tag presence is an open question.

Once the first build is validated, this document will be updated with the finalized wiring, GPIO assignments, and any discovered caveats — and the "pending first-build validation" markers above will be removed.

## Community-validated hardware

This section documents alternative hardware combinations that other AmmoLedger users have validated. AmmoLedger does not test or support these directly, but PRs documenting working builds are welcome.

*Currently empty. To contribute a known-working alternative build, open a PR adding an entry to this section with:*

- *The exact components used (with sources and part numbers if possible).*
- *Wiring notes documenting differences from the reference build.*
- *The ESPHome YAML that worked (placed in [`esphome-configs/`](./esphome-configs/) with a descriptive filename indicating the hardware variant).*
- *Caveats, range observations, or behavior differences compared to the reference build.*

Likely-useful contributed variants:

- **Headless variant** — ESP-WROOM-32 + PN532 without a display. Simpler and cheaper (~$25 total) for users who just want intake automation and don't need on-device feedback. This was the previous canonical build and remains a perfectly reasonable starting point for someone who doesn't want the display complexity.
- **Larger-display variant** — Waveshare ESP32-S3-Touch-LCD-2.8 (480x480 RGB) for users who want more screen real estate. Requires RGB display driver in ESPHome.
- **Touch-AMOLED variant** — LilyGo T-Display-S3 AMOLED Touch with RM67162 display. Visually striking but requires the `qspi_dbi` display component and has known board-revision pinout discrepancies.

## Contributing improvements to the reference build

If you find a problem with the reference build (a wiring issue, a YAML bug, a better default setting), open a PR against this document or the example YAML directly. The reference build is intended to be a known-good single source of truth — corrections are valued.
