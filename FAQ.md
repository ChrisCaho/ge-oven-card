# GE Oven Card — Frequently Asked Questions

---

## General

### Why does the SmartHQ integration use `water_heater` entities for an oven?

This is a deliberate choice by the SmartHQ / GE Home integration author. The Home Assistant `water_heater` entity type shares enough structure with an oven (a target temperature, an operation mode, and a current temperature) that it was the closest built-in entity type available. It is not a bug in this card or in Home Assistant. The GE Oven Card is designed specifically to read `water_heater` entities and present them in a way that actually looks like an oven.

### Which GE appliances work with this card?

This card works with any GE oven cavity that is exposed as a `water_heater` entity by the SmartHQ integration. This includes:

- GE Profile single-wall ovens
- GE Profile double-wall ovens (each cavity gets its own card)
- GE Profile TwinFlex ranges (three cavities — use `normal`, `medium`, and `small` sizes)
- GE Cafe ovens via SmartHQ

It does not support GE dishwashers, refrigerators, washers, or dryers. Separate cards exist for those appliances (see the `ge-appliances-card` bundle).

### Can I control the oven from this card?

No. The card is a monitoring display only. It shows the current state of the oven but does not send any commands. You can use Home Assistant automations or scripts with the `water_heater.set_temperature` and `water_heater.set_operation_mode` services if you need to control the oven programmatically.

---

## Display and Temperatures

### Why do temperatures show "--" instead of a number?

There are two reasons a temperature shows "--":

1. **Sensor floor**: The SmartHQ integration reports 100 degrees F as a floor value when the oven has not heated or when a sensor has no valid reading. The card treats 100 degrees F the same as zero or null — it displays "--" rather than show a misleading value.

2. **Oven is off**: When the oven is off, `current_temperature` and `target` may be 0 or the sensor floor. The card shows "--" in those cases.

This behavior applies to the LCD readout and to all fields in the attribute grid.

### The LCD shows the oven temperature but it looks lower than expected. Why?

The LCD prefers the `display_temperature` attribute over `current_temperature` when both are available. The `display_temperature` is what the physical oven display shows, which may differ slightly from `current_temperature` due to sensor averaging or rounding. If `display_temperature` is unavailable or at the sensor floor, the card falls back to `current_temperature`.

### What is the temperature range shown in the top bar?

The small text in the center of the top bar (for example, `170°–550°`) comes from the `min_temp` and `max_temp` attributes of the `water_heater` entity. These reflect the actual minimum and maximum temperatures the oven cavity supports as reported by SmartHQ.

---

## LCD Priority

### How does the card decide what to show on the right side of the LCD?

The right side of the LCD follows a priority order:

1. If a cook timer is actively counting down, it shows `COOK Xh Ym`
2. If no cook timer is active but a kitchen timer is running, it shows `TIMER Xm`
3. If neither timer is active but a target temperature is set, it shows `SET XXX°`
4. If none of the above applies, the right side is blank

---

## Sensors and Auto-Discovery

### What sensor entities does the card look for?

The card automatically derives sensor entity IDs from your primary `water_heater` entity ID. No manual configuration is needed.

For a primary entity of `water_heater.hasvr1_ge_top_oven`, the card looks for:

| Entity | Purpose |
|--------|---------|
| `sensor.hasvr1_ge_top_oven_cook_time_remaining` | Cook timer countdown |
| `sensor.hasvr1_ge_top_oven_kitchen_timer` | Kitchen timer countdown |
| `sensor.hasvr1_ge_top_oven_probe_display_temp` | Meat probe temperature |
| `select.hasvr1_ge_top_oven_light` | Oven light on/off state |

If any of these entities do not exist in your system, the corresponding field simply shows "--" or remains hidden. The card does not error if companion entities are missing.

### How do I find the correct entity IDs for my oven?

Go to **Settings > Devices and Services > SmartHQ** in Home Assistant, find your oven device, and look at the entity list. The `water_heater` entity is the primary one. The sensors and selects associated with that device follow the naming pattern described above.

You can also use the Home Assistant Developer Tools (States tab) and search for your oven's name to see all related entities at once.

---

## Oven Light Indicator

### What is the lightbulb icon in the top bar?

The lightbulb icon indicates whether the oven interior light is on. When the oven light is on it glows yellow; when the light is off it appears dim. The state is read from a `select.*_light` entity that SmartHQ creates for the oven.

### The lightbulb icon is always dim even when my oven light is on. Why?

The `select.*_light` entity may not be available in your setup for one of these reasons:

- Your specific oven model does not have a controllable interior light, so SmartHQ does not create the entity
- The SmartHQ integration is connecting remotely (via the cloud) rather than locally, and some entities are not exposed in remote mode
- The entity exists but has a different naming pattern than expected

To check, go to the Home Assistant States developer tool and search for your oven name combined with "light". If no `select.*_light` entity appears, SmartHQ is not providing that data and the indicator will remain dim.

---

## Card Sizes

### What are the three sizes for?

The three sizes — `normal`, `medium`, and `small` — control the height of the oven window area inside the door frame. They exist to support multi-cavity ovens where you want to stack multiple cards on the same dashboard.

A GE Profile TwinFlex range has three cavities of different physical sizes. By using `small` for the top cavity, `medium` for the middle cavity, and `normal` for the bottom cavity, the three cards stacked vertically roughly mirror the proportions of the actual appliance.

For a standard single oven, use `normal`.

---

## Probe

### What does the probe indicator show?

When a meat probe is inserted into the oven (the `probe_present` attribute is `true`), the card shows:

- On the LCD lower-right: `PROBE XXX°F` if a temperature reading is available, or `PROBE` if the probe is present but not yet reading a temperature
- In the attribute grid: the probe temperature in green if available, or "In" to indicate the probe is inserted with no reading yet

When no probe is present the attribute grid shows a dimmed "No" label.

---

## Errors and Troubleshooting

### The card shows "Entity not found" in red. What do I do?

This means the `entity` ID you set in the card configuration does not exist in Home Assistant. Common causes:

1. **Typo in the entity ID**: Double-check the entity ID against the States developer tool. Entity IDs are case-sensitive.
2. **SmartHQ not connected**: The SmartHQ integration may be offline or not yet finished setting up. Check **Settings > Devices and Services** for any error on the SmartHQ integration.
3. **Wrong entity type**: Make sure you are using the `water_heater.*` entity and not a sensor or switch.

### The card loads but shows stale or incorrect data.

The card updates every time Home Assistant pushes a state change to the frontend. If data looks stale:

- Check that the SmartHQ integration is connected and polling normally
- Check the entity in the States developer tool to see its last-updated time
- The SmartHQ cloud poll interval is typically 30 seconds to a few minutes depending on the oven activity

---

## Automations

### How do I set up a notification when the oven finishes preheating?

You can trigger on the `display_state` attribute reaching a certain value, or on `current_temperature` meeting or exceeding `temperature`. A simple example:

```yaml
alias: Notify when oven reaches set temperature
trigger:
  - platform: template
    value_template: >
      {% set s = states('water_heater.hasvr1_ge_top_oven') %}
      {% set cur = state_attr('water_heater.hasvr1_ge_top_oven', 'current_temperature') %}
      {% set tgt = state_attr('water_heater.hasvr1_ge_top_oven', 'temperature') %}
      {{ s not in ['off', 'unavailable'] and cur is not none and tgt is not none and cur | int >= tgt | int }}
condition: []
action:
  - service: notify.mobile_app_your_phone
    data:
      message: "Oven is up to temperature ({{ tgt }}°F)"
mode: single
```

### How do I get notified when the cook timer reaches zero?

Watch for the `sensor.*_cook_time_remaining` entity transitioning to `0` or becoming unavailable:

```yaml
alias: Notify when cook timer ends
trigger:
  - platform: state
    entity_id: sensor.hasvr1_ge_top_oven_cook_time_remaining
    to: "0"
action:
  - service: notify.mobile_app_your_phone
    data:
      message: "Cook timer has finished."
mode: single
```

---

## Installation

### Do I need HACS to use this card?

No. HACS is the easiest installation method but it is not required. You can manually download `ge-oven-card.js` and add it as a Lovelace resource. See the Manual Installation section in the README.

### After updating the card the UI still shows the old version.

The card version is shown in the footer of each card. If it does not change after an update, your browser is serving a cached copy of the JavaScript file. Hard-refresh your browser (Ctrl+Shift+R on Windows/Linux, Cmd+Shift+R on macOS) or clear your browser cache and reload.
