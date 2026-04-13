# GE Oven Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)
[![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue.svg)](https://unlicense.org/)

A custom Lovelace card for GE Profile ovens connected via the [SmartHQ](https://www.geappliances.com/connect) integration.

Designed to look like a GE Profile oven with a blue LCD digital display, door frame with handle, oven window with animated heating elements, and a compact attribute panel. Supports single ovens, double ovens, and GE TwinFlex triple-cavity configurations.

![GE Oven Card](screenshot.jpg)

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

Each oven cavity gets its own card. Add one card per `water_heater` entity.

```yaml
type: custom:ge-oven-card
entity: water_heater.hasvr1_ge_bottom_oven
name: "Bottom Oven"
size: normal
```

| Option   | Required | Default  | Description                                         |
|----------|----------|----------|-----------------------------------------------------|
| `entity` | Yes      |          | `water_heater` entity from SmartHQ                  |
| `name`   | No       |          | Override display name                               |
| `size`   | No       | `normal` | Oven cavity size: `normal`, `medium`, or `small`    |

### Size Options

| Size     | Door Height | Use Case                                    |
|----------|-------------|---------------------------------------------|
| `normal` | Full        | Standard single oven or double oven cavity  |
| `medium` | 2/3         | Lower cavity of a TwinFlex                  |
| `small`  | 1/3         | Upper cavity of a TwinFlex                  |

The LCD display and attribute panel stay the same size across all options — only the oven door/window scales.

### Example Configurations

**Single oven:**
```yaml
type: custom:ge-oven-card
entity: water_heater.ge_oven
name: "Oven"
size: normal
```

**Double oven (two full-size cavities):**
```yaml
# Upper oven
type: custom:ge-oven-card
entity: water_heater.ge_upper_oven
name: "Upper Oven"
size: normal
```
```yaml
# Lower oven
type: custom:ge-oven-card
entity: water_heater.ge_lower_oven
name: "Lower Oven"
size: normal
```

**Triple-cavity GE Profile TwinFlex:**
```yaml
# Top oven (small TwinFlex cavity)
type: custom:ge-oven-card
entity: water_heater.hasvr1_ge_top_oven
name: "Top Oven"
size: small
```
```yaml
# Middle oven (medium TwinFlex cavity)
type: custom:ge-oven-card
entity: water_heater.hasvr1_ge_middle_oven
name: "Middle Oven"
size: medium
```
```yaml
# Bottom oven (full-size single cavity)
type: custom:ge-oven-card
entity: water_heater.hasvr1_ge_bottom_oven
name: "Bottom Oven"
size: normal
```

## Features

- **Blue LCD digital display** with CRT scanline effect showing current temperature, target temperature, and cooking mode
- **Door frame** with handle wrapping the oven window and attribute panel
- **Oven window** with orange glow and animated heating elements when active — displays the active cooking mode (Bake, Broil, Air Fry, Convection Roast, etc.)
- **Pulsing heat glow animation** when oven is heating
- **Dark window** when oven is off (no clutter)
- **Compact attribute grid** showing all entity data
- **Probe indicator** when a temperature probe is connected
- **Configurable door size** for TwinFlex and other multi-cavity ovens

## Entity Attributes Displayed

All attributes from the SmartHQ `water_heater` entity are shown:

| Attribute             | Location              |
|-----------------------|-----------------------|
| `current_temperature` | LCD (large) + grid    |
| `temperature` (target)| LCD (SET) + grid      |
| `operation_mode`      | LCD + oven window     |
| `display_state`       | LCD (when off)        |
| `display_temperature` | Grid                  |
| `raw_temperature`     | Grid                  |
| `min_temp` / `max_temp`| Grid (range)         |
| `probe_present`       | LCD (PROBE) + grid    |

## Compatibility

- **Integration**: [SmartHQ / GE Home](https://github.com/simbaja/ha_gehome) (exposes ovens as `water_heater` entities)
- **Home Assistant**: 2024.1+
- **HACS**: Compatible as custom repository

## Notes

- The SmartHQ integration exposes GE ovens as `water_heater` entities — this is by design from the integration author, not a bug.
- Cooking modes (Bake, Broil, Air Fry, Convection Bake, Convection Roast, Conv. Multi-Bake, etc.) are determined by what each oven cavity supports and are reported by SmartHQ.
- When the oven is off, `display_temperature` and `target` show "--" instead of 0.

## License

This is free and unencumbered software released into the public domain under [The Unlicense](LICENSE).
