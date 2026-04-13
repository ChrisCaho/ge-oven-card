# GE Oven Card

A custom Lovelace card for GE Profile ovens connected via the SmartHQ integration.

Designed to look like a GE Profile oven front panel with a green LCD digital display,
oven window with animated heating elements, and full attribute readout.

## Installation

### HACS (Custom Repository)
1. Open HACS > Frontend
2. Click the three dots menu > Custom repositories
3. Add the repository URL, category: Lovelace
4. Install "GE Oven Card"

### Manual
Copy `ge-oven-card.js` to `/config/www/community/ge-oven-card/` and add as a Lovelace resource:
```
/hacsfiles/ge-oven-card/ge-oven-card.js
```

## Configuration

```yaml
type: custom:ge-oven-card
entity: water_heater.hasvr1_ge_top_oven
name: "Top Oven"
```

| Option   | Required | Description                        |
|----------|----------|------------------------------------|
| `entity` | Yes      | `water_heater` entity from SmartHQ |
| `name`   | No       | Override display name              |

## Features

- Green LCD digital display showing temperature and cooking mode
- Oven window with animated heating elements when active
- Probe indicator
- All entity attributes displayed
- Available cooking mode chips
- Pulsing heat glow animation when oven is on

## Screenshots

*Coming soon*
