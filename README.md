# GE Oven Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)
[![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue.svg)](https://unlicense.org/)

A custom Lovelace card for GE Profile ovens connected via the [SmartHQ](https://www.geappliances.com/connect) integration.

Displays oven status with a blue LCD digital display, animated oven window with heating elements, and full attribute readout. Supports GE TwinFlex dual-cavity ovens with configurable door sizes.

## Installation

### HACS (Custom Repository)
1. Open HACS > Frontend
2. Click the three dots menu > Custom repositories
3. Add `https://github.com/ChrisCaho/ge-oven-card`, category: **Lovelace**
4. Search for "GE Oven Card" and install

### Manual
1. Copy `ge-oven-card.js` to `/config/www/community/ge-oven-card/`
2. Add as a Lovelace resource:
   - URL: `/hacsfiles/ge-oven-card/ge-oven-card.js`
   - Type: JavaScript Module

## Configuration

```yaml
type: custom:ge-oven-card
entity: water_heater.hasvr1_ge_top_oven
name: "Top Oven"
size: normal
```

| Option   | Required | Default  | Description                                         |
|----------|----------|----------|-----------------------------------------------------|
| `entity` | Yes      |          | `water_heater` entity from SmartHQ                  |
| `name`   | No       |          | Override display name                               |
| `size`   | No       | `normal` | Oven cavity size: `normal`, `medium`, or `small`    |

### Size Options

| Size     | Use Case                                    |
|----------|---------------------------------------------|
| `normal` | Standard single oven (full-size door)       |
| `medium` | Lower cavity of a TwinFlex (~2/3 height)    |
| `small`  | Upper cavity of a TwinFlex (~1/3 height)    |

The LCD display stays the same size across all options — only the oven door/window scales.

### Example: Triple-Cavity GE Profile Oven

```yaml
# Top oven (small TwinFlex cavity)
type: custom:ge-oven-card
entity: water_heater.hasvr1_ge_top_oven
name: "Top Oven"
size: small

# Middle oven (medium TwinFlex cavity)
type: custom:ge-oven-card
entity: water_heater.hasvr1_ge_middle_oven
name: "Middle Oven"
size: medium

# Bottom oven (full-size single cavity)
type: custom:ge-oven-card
entity: water_heater.hasvr1_ge_bottom_oven
name: "Bottom Oven"
size: normal
```

## Features

- Blue LCD digital display showing temperature and cooking mode
- Oven window with animated heating elements when active
- Probe indicator (when probe is connected)
- All entity attributes displayed (current/target/display/raw temps, range, probe status)
- Available cooking mode chips
- Pulsing heat glow animation when oven is on
- Configurable door size for TwinFlex dual-cavity ovens

## Entity Attributes Displayed

| Attribute             | Location        |
|-----------------------|-----------------|
| `current_temperature` | LCD + grid      |
| `temperature` (target)| LCD + grid      |
| `operation_mode`      | LCD + mode chips|
| `display_state`       | LCD             |
| `display_temperature` | Grid            |
| `raw_temperature`     | Grid            |
| `min_temp` / `max_temp`| Grid (range)   |
| `probe_present`       | LCD + grid      |

## Compatibility

- **Integration**: [SmartHQ / GE Home](https://github.com/simbaja/ha_gehome) (exposes ovens as `water_heater` entities)
- **Home Assistant**: 2024.1+
- **HACS**: Compatible as custom repository

## License

This project is released into the public domain under [The Unlicense](LICENSE). See the LICENSE file for details.
