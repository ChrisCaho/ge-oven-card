/**
 * GE Appliances Card - Bundle v1.10.1
 *
 * A comprehensive set of custom Home Assistant Lovelace cards for GE Profile
 * appliances connected via the SmartHQ integration.
 *
 * Includes: GE Oven Card v2.9.1, GE Washer Card v1.4.1, GE Dryer Card v1.6.1
 *
 * https://github.com/ChrisCaho/ge-appliances-card
 */

const GE_OVEN_CARD_VERSION = '2.9.1';
console.log(`GE Oven Card v${GE_OVEN_CARD_VERSION}: loading...`);

class GeOvenCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = null;
    this._rendered = false; // track if initial DOM is built
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error('You need to define an "entity" (water_heater entity ID)');
    }
    const size = (config.size || 'normal').toLowerCase();
    if (!['normal', 'medium', 'small'].includes(size)) {
      throw new Error('Invalid size: must be "normal", "medium", or "small"');
    }
    this._config = {
      entity: config.entity,
      name: config.name || null,
      size: size,
    };
    this._rendered = false; // force full re-render on config change
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  getCardSize() {
    const sizes = { normal: 6, medium: 5, small: 4 };
    return sizes[this._config?.size] || 6;
  }

  static getConfigElement() {
    return null;
  }

  static getStubConfig() {
    return { entity: 'water_heater.ge_oven', name: 'GE Oven', size: 'normal' };
  }

  _getSensor(suffix) {
    if (!this._hass) return null;
    const sensorId = this._config.entity.replace('water_heater.', 'sensor.') + '_' + suffix;
    const entity = this._hass.states[sensorId];
    return entity ? entity.state : null;
  }

  _formatTime(seconds) {
    const s = parseFloat(seconds);
    if (!s || s <= 0) return null;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  _formatElapsed(seconds) {
    const s = parseFloat(seconds);
    if (!s || s <= 0) return null;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  _delayStartTime(val) {
    if (!val || val === '0:00') return null;
    const parts = String(val).split(':');
    if (parts.length !== 2) return null;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    const now = new Date();
    now.setMinutes(now.getMinutes() + h * 60 + m);
    let hours = now.getHours();
    const mins = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${String(mins).padStart(2, '0')} ${ampm}`;
  }

  _getModeInfo(displayState, opMode) {
    const effectiveMode = (opMode && opMode !== 'Unknown' && opMode !== 'Off') ? opMode : displayState;
    const mode = (effectiveMode || '').toLowerCase();

    // GE Profile True European Convection ovens (PTS9000/PTS9200):
    // - Bake (Thermal): bottom + top(cycles), no fan
    // - Broil: top only, no fan
    // - Convection Bake: rear element only + fan (no top/bottom visible elements)
    // - Conv. Multi-Bake: same as Convection Bake
    // - Convection Roast: top + rear element + fan (high speed)
    // - Air Fry: top + bottom + rear element + fan (high speed, all elements)
    // - Convection Broil: top + fan
    // - Warm: bottom only (low), no fan
    // - Proof: top briefly, no fan
    // - Dehydrate: rear element + fan
    // Since we can only show top/bottom elements visually, the rear element is
    // represented by the convection fan being active.

    const isAirFry = mode.includes('air fry');
    const isBroil = mode.includes('broil');
    const isRoast = mode.includes('roast');
    const isConvBake = (mode.includes('convection') || mode.includes('conv.')) &&
                       (mode.includes('bake') || mode.includes('multi'));
    const isConvBroil = (mode.includes('convection') || mode.includes('conv.')) && isBroil;
    const isDehydrate = mode.includes('dehydrate');
    const isWarm = mode.includes('warm');
    const isProof = mode.includes('proof');
    const isBake = mode.includes('bake') && !isConvBake && !isRoast && !isBroil;
    const isConvection = isAirFry || isConvBake || isRoast || isConvBroil || isDehydrate;

    let topElement, bottomElement;
    if (isAirFry) {
      topElement = true; bottomElement = true;     // all elements active
    } else if (isConvBake || isDehydrate) {
      topElement = false; bottomElement = false;    // rear element only (shown via fan)
    } else if (isConvBroil) {
      topElement = true; bottomElement = false;     // top + fan
    } else if (isRoast) {
      topElement = true; bottomElement = false;     // top + rear element
    } else if (isBroil) {
      topElement = true; bottomElement = false;
    } else if (isWarm) {
      topElement = false; bottomElement = true;     // low bottom heat
    } else if (isProof) {
      topElement = true; bottomElement = false;     // brief top element
    } else if (isBake) {
      topElement = false; bottomElement = true;     // primarily bottom
    } else {
      topElement = true; bottomElement = true;      // default: both
    }

    return { isConvection, isBroil, isRoast, isBake, isAirFry, topElement, bottomElement };
  }

  // Gather all display values from current state
  _getDisplayData() {
    const entityId = this._config.entity;
    const stateObj = this._hass.states[entityId];
    if (!stateObj) return null;

    const attrs = stateObj.attributes;
    const state = stateObj.state;
    const isOff = state.toLowerCase() === 'off' || state.toLowerCase() === 'unavailable';
    const opMode = attrs.operation_mode || 'Off';
    const currentTemp = attrs.current_temperature;
    const targetTemp = attrs.temperature;
    const displayTemp = attrs.display_temperature;
    const probePresent = attrs.probe_present || false;
    const displayState = attrs.display_state || state;
    const friendlyName = this._config.name || attrs.friendly_name || 'GE Oven';
    const resolvedMode = (opMode === 'Unknown' || !opMode || opMode === 'Off') ? displayState : opMode;

    const delayTimeAttr = attrs.delay_time_remaining;
    const isDelay = displayState.toLowerCase().includes('delay');
    const delayStartTime = this._delayStartTime(delayTimeAttr);
    const isActive = !isOff && !isDelay;
    const isEngaged = !isOff;
    const modeInfo = this._getModeInfo(displayState, opMode);

    const lightEntityId = this._config.entity.replace('water_heater.', 'select.') + '_light';
    const lightObj = this._hass.states[lightEntityId];
    const lightOn = lightObj && lightObj.state.toLowerCase() !== 'off';

    const cookTimeRaw = this._getSensor('cook_time_remaining');
    const kitchenTimerRaw = this._getSensor('kitchen_timer');
    const probeTemp = this._getSensor('probe_display_temp');
    const cookTimeElapsedRaw = this._getSensor('cooking_elapsed');

    const cookTime = this._formatTime(cookTimeRaw);
    const kitchenTimer = this._formatTime(kitchenTimerRaw);
    const probeTempVal = probeTemp ? parseFloat(probeTemp) : 0;
    const elapsed = this._formatElapsed(cookTimeElapsedRaw);

    const isBogus = (v) => v == null || v === 0 || v === 100 || v === '100';
    const realDisplayTemp = isBogus(displayTemp) ? null : displayTemp;
    const realCurrentTemp = isBogus(currentTemp) ? null : currentTemp;
    const lcdTemp = isActive && realDisplayTemp ? `${realDisplayTemp}` : (realCurrentTemp != null ? `${realCurrentTemp}` : '--');

    let lcdRight = '';
    if (isDelay && targetTemp) {
      lcdRight = `SET ${targetTemp}°`;
    } else if (cookTime) {
      lcdRight = `COOK ${cookTime}`;
    } else if (kitchenTimer) {
      lcdRight = `TIMER ${kitchenTimer}`;
    } else if (isActive && targetTemp) {
      lcdRight = `SET ${targetTemp}°`;
    }

    let lcdStatusRight = '';
    if (probePresent && probeTempVal > 0) {
      lcdStatusRight = `PROBE ${probeTempVal}°F`;
    } else if (probePresent) {
      lcdStatusRight = 'PROBE';
    }

    let probeDisplay;
    if (probePresent && probeTempVal > 0) {
      probeDisplay = `${probeTempVal}°F`;
    } else if (probePresent) {
      probeDisplay = '● In';
    } else {
      probeDisplay = '○ No';
    }
    const probeClass = probePresent ? 'active' : 'inactive';

    let lcdModeText;
    if (isDelay) {
      lcdModeText = delayStartTime ? `Start At ${delayStartTime}` : displayState;
    } else if (isActive) {
      const phase = displayState.toLowerCase();
      const modeLC = resolvedMode.toLowerCase();
      const showPhase = phase !== modeLC && phase !== 'off' && phase !== state.toLowerCase();
      lcdModeText = showPhase ? `${resolvedMode} - ${displayState}` : resolvedMode;
    } else {
      lcdModeText = displayState;
    }

    const fmtTemp = (v) => (v != null && !isBogus(v)) ? `${v}°F` : '--';

    return {
      entityId, friendlyName, isOff, isActive, isEngaged, isDelay,
      lcdTemp, lcdRight, lcdModeText, lcdStatusRight, lightOn,
      showTopElement: isActive && modeInfo.topElement,
      showBottomElement: isActive && modeInfo.bottomElement,
      showConvFan: isActive && modeInfo.isConvection,
      isConvection: modeInfo.isConvection,
      hasBottomElement: modeInfo.bottomElement,
      hasTopElement: modeInfo.topElement,
      currentFormatted: fmtTemp(currentTemp),
      targetFormatted: targetTemp != null ? `${targetTemp}°F` : '--',
      probeDisplay, probeClass,
      cookTime: cookTime || '--', cookTimeActive: !!cookTime,
      kitchenTimer: kitchenTimer || '--', kitchenTimerActive: !!kitchenTimer,
      elapsed: elapsed || '--', elapsedActive: !!elapsed,
      minTemp: attrs.min_temp, maxTemp: attrs.max_temp,
    };
  }

  // Build initial DOM structure (only once)
  _buildDom() {
    const size = this._config.size;
    const windowHeight = { normal: 180, medium: 120, small: 60 }[size];
    const windowPadding = { normal: 16, medium: 10, small: 6 }[size];

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          background: linear-gradient(175deg, #1a1a1e 0%, #0d0d10 100%);
          border: 1px solid #2a2a30;
          border-radius: 16px;
          overflow: hidden;
          font-family: 'Segoe UI', Roboto, sans-serif;
          color: #e0e0e0;
          padding: 0;
        }
        .oven-body { padding: 16px 16px 10px; }

        .top-bar {
          display: flex; align-items: center;
          justify-content: space-between; margin-bottom: 10px;
        }
        .brand { font-size: 11px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #888; }
        .oven-name { font-size: 13px; font-weight: 500; color: #aaa; }
        .temp-range { font-size: 10px; color: #888; letter-spacing: 0.5px; }
        .oven-light {
          position: absolute; top: 8px; right: 12px; font-size: 18px;
          color: #ffcc33; text-shadow: 0 0 10px rgba(255,200,50,0.7), 0 0 20px rgba(255,180,30,0.4);
          z-index: 2; display: none;
        }
        .oven-light.visible { display: block; }

        .lcd-bezel {
          background: #050508; border: 2px solid #333; border-radius: 8px;
          padding: 3px; margin-bottom: 16px; box-shadow: inset 0 2px 8px rgba(0,0,0,0.8);
        }
        .lcd-screen {
          background: linear-gradient(180deg, #080a1a 0%, #0d1025 50%, #080a1a 100%);
          border-radius: 5px; padding: 14px 16px; position: relative;
          overflow: hidden; min-height: 80px;
          display: flex; flex-direction: column; justify-content: center;
        }
        .lcd-screen.active {
          background: linear-gradient(180deg, #080a1a 0%, #101830 50%, #080a1a 100%);
        }
        .lcd-screen::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px);
          pointer-events: none; z-index: 1;
        }
        .lcd-row { display: flex; align-items: baseline; justify-content: space-between; position: relative; z-index: 2; }
        .lcd-row.main { margin-bottom: 4px; }
        .lcd-temp {
          font-family: 'Courier New', 'Consolas', monospace; font-size: 48px; font-weight: 700;
          color: #66bbff; text-shadow: 0 0 12px rgba(102,187,255,0.6); line-height: 1; letter-spacing: 2px;
        }
        .lcd-temp.off { color: #5599cc; text-shadow: 0 0 8px rgba(85,153,204,0.4); }
        .lcd-degree {
          font-size: 24px; color: #66bbff; text-shadow: 0 0 8px rgba(102,187,255,0.5);
          margin-left: 2px; vertical-align: super;
        }
        .lcd-degree.off { color: #5599cc; text-shadow: 0 0 6px rgba(85,153,204,0.4); }
        .lcd-target {
          font-family: 'Courier New', 'Consolas', monospace; font-size: 22px;
          color: #55aaee; text-shadow: 0 0 8px rgba(85,170,238,0.4); opacity: 0.9;
        }
        .lcd-mode {
          font-family: 'Courier New', 'Consolas', monospace; font-size: 14px;
          color: #5599dd; text-shadow: 0 0 6px rgba(85,153,221,0.4);
          text-transform: uppercase; letter-spacing: 1px;
        }
        .lcd-mode.off { color: #6699cc; text-shadow: 0 0 6px rgba(102,153,204,0.4); }
        .lcd-status {
          font-family: 'Courier New', 'Consolas', monospace; font-size: 12px;
          color: #55aaee; text-shadow: 0 0 4px rgba(85,170,238,0.4);
        }

        .door-frame {
          border: 2px solid #3a3a40; border-radius: 14px; padding: 10px 8px 8px;
          margin-bottom: 8px;
          background: linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.1) 100%);
        }
        .handle-bar {
          width: 55%; height: 6px;
          background: linear-gradient(180deg, #666 0%, #444 40%, #555 100%);
          border-radius: 3px; margin: 0 auto 10px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
        }

        .oven-window {
          background: linear-gradient(180deg, #0a0a0c 0%, #141416 50%, #0a0a0c 100%);
          border: 2px solid #2a2a2e; border-radius: 10px;
          padding: ${windowPadding}px; min-height: ${windowHeight}px;
          display: flex; flex-direction: column; justify-content: space-between;
          box-shadow: inset 0 4px 16px rgba(0,0,0,0.6);
          position: relative; overflow: hidden;
        }
        .oven-window.active {
          background: linear-gradient(180deg, #1a0800 0%, #2d1000 30%, #3a1500 50%, #2d1000 70%, #1a0800 100%);
          border-color: #553300;
          box-shadow: inset 0 0 30px rgba(255,100,0,0.12), inset 0 4px 16px rgba(0,0,0,0.4);
        }

        /* === HEAT ELEMENTS — very slow, smooth breathing === */
        .heat-element {
          height: 4px;
          background: linear-gradient(90deg, transparent 0%, #ff4400 15%, #ff6600 50%, #ff4400 85%, transparent 100%);
          border-radius: 2px; opacity: 0; z-index: 2; position: relative;
        }
        .heat-element.on {
          animation: elementPulse 8s ease-in-out infinite;
        }
        @keyframes elementPulse {
          0%, 100% { opacity: 0.45; box-shadow: 0 0 4px rgba(255, 80, 0, 0.2); }
          50% { opacity: 0.8; box-shadow: 0 0 12px rgba(255, 80, 0, 0.5); }
        }
        .heat-element.off { opacity: 0; }

        .window-spacer { flex: 1; position: relative; overflow: hidden; }

        /* === CONVECTION FAN — fixed container, only blades rotate === */
        .conv-fan {
          position: absolute; top: 50%; left: 50%;
          width: 60px; height: 60px;
          margin-top: -30px; margin-left: -30px;
          z-index: 3; display: none;
        }
        .conv-fan.visible { display: block; }
        .fan-ring {
          position: absolute; width: 56px; height: 56px;
          border: 2px solid rgba(200,160,120,0.3); border-radius: 50%;
          top: 2px; left: 2px;
          transition: border-width 0.3s, border-color 0.3s;
        }
        .fan-ring.element-on {
          border-width: 3px;
          border-color: #ff4400;
          animation: elementPulse 8s ease-in-out infinite;
          box-shadow: 0 0 8px rgba(255, 80, 0, 0.3);
        }
        .fan-blades {
          position: absolute; width: 60px; height: 60px; top: 0; left: 0;
          animation: fanSpin 8s linear infinite;
          will-change: transform;
        }
        @keyframes fanSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .fan-blade {
          position: absolute; width: 22px; height: 8px;
          background: rgba(220,170,120,0.45);
          border-radius: 2px 4px 4px 2px;
          top: 50%; left: 50%; transform-origin: 0% 50%;
        }
        .fan-blade.b1 { transform: translate(0%,-50%) rotate(0deg); }
        .fan-blade.b2 { transform: translate(0%,-50%) rotate(60deg); }
        .fan-blade.b3 { transform: translate(0%,-50%) rotate(120deg); }
        .fan-blade.b4 { transform: translate(0%,-50%) rotate(180deg); }
        .fan-blade.b5 { transform: translate(0%,-50%) rotate(240deg); }
        .fan-blade.b6 { transform: translate(0%,-50%) rotate(300deg); }
        .fan-hub {
          position: absolute; width: 10px; height: 10px;
          background: rgba(200,160,120,0.6); border: 1px solid rgba(220,180,140,0.4);
          border-radius: 50%; top: 50%; left: 50%;
          margin-top: -5px; margin-left: -5px;
        }

        /* === RISING HEAT WAVES === */
        .heat-waves-rising {
          position: absolute; bottom: 0; left: 0; right: 0; top: 0;
          pointer-events: none; z-index: 1; display: none;
        }
        .heat-waves-rising.visible { display: block; }
        .wave-rise {
          position: absolute; bottom: 0; font-size: 20px;
          opacity: 0;
          color: rgba(255, 150, 60, 0.9);
          text-shadow: 0 0 10px rgba(255, 120, 30, 0.7);
          animation: riseWave 7s ease-out infinite;
        }
        @keyframes riseWave {
          0% { transform: translateY(0); opacity: 0; }
          3% { opacity: 0.9; }
          35% { opacity: 0.6; }
          100% { transform: translateY(-120px); opacity: 0; }
        }
        .wave-rise.r1 { left: 15%; animation-delay: 0s; }
        .wave-rise.r2 { left: 35%; animation-delay: 1.4s; }
        .wave-rise.r3 { left: 55%; animation-delay: 2.8s; }
        .wave-rise.r4 { left: 75%; animation-delay: 0.7s; }
        .wave-rise.r5 { left: 45%; animation-delay: 4.2s; }

        /* === FALLING HEAT WAVES === */
        .heat-waves-falling {
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          pointer-events: none; z-index: 1; display: none;
        }
        .heat-waves-falling.visible { display: block; }
        .wave-fall {
          position: absolute; top: 0; font-size: 20px;
          opacity: 0;
          color: rgba(255, 150, 60, 0.9);
          text-shadow: 0 0 10px rgba(255, 120, 30, 0.7);
          animation: fallWave 7s ease-out infinite;
        }
        @keyframes fallWave {
          0% { transform: translateY(0); opacity: 0; }
          3% { opacity: 0.9; }
          35% { opacity: 0.6; }
          100% { transform: translateY(120px); opacity: 0; }
        }
        .wave-fall.f1 { left: 20%; animation-delay: 0.4s; }
        .wave-fall.f2 { left: 40%; animation-delay: 1.8s; }
        .wave-fall.f3 { left: 60%; animation-delay: 0s; }
        .wave-fall.f4 { left: 80%; animation-delay: 3.2s; }
        .wave-fall.f5 { left: 50%; animation-delay: 1.1s; }

        /* === CONVECTION CIRCULATING WAVES — smooth ovals === */
        .heat-waves-convection {
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          pointer-events: none; z-index: 1; display: none;
        }
        .heat-waves-convection.visible { display: block; }
        .conv-wave {
          position: absolute; font-size: 18px;
          opacity: 0;
          color: rgba(255, 150, 60, 0.9);
          text-shadow: 0 0 10px rgba(255, 120, 30, 0.7);
        }
        /* 3 on oval A, 3 on oval B — fade in/out during orbit */
        .conv-wave.w1 { animation: ovalA 8s linear infinite; }
        .conv-wave.w2 { animation: ovalA 8s linear infinite 2.67s; }
        .conv-wave.w3 { animation: ovalA 8s linear infinite 5.33s; }
        .conv-wave.w4 { animation: ovalB 9s linear infinite 0.5s; }
        .conv-wave.w5 { animation: ovalB 9s linear infinite 3.5s; }
        .conv-wave.w6 { animation: ovalB 9s linear infinite 6.5s; }

        @keyframes ovalA {
          0%   { top: 50%; left: 10%; opacity: 0; }
          5%   { opacity: 0.85; }
          25%  { top: 15%; left: 50%; opacity: 0.8; }
          45%  { opacity: 0.85; }
          50%  { top: 50%; left: 90%; opacity: 0; }
          55%  { opacity: 0.85; }
          75%  { top: 85%; left: 50%; opacity: 0.8; }
          95%  { opacity: 0.85; }
          100% { top: 50%; left: 10%; opacity: 0; }
        }
        @keyframes ovalB {
          0%   { top: 10%; left: 50%; opacity: 0; }
          5%   { opacity: 0.8; }
          25%  { top: 50%; left: 10%; opacity: 0.75; }
          45%  { opacity: 0.8; }
          50%  { top: 90%; left: 50%; opacity: 0; }
          55%  { opacity: 0.8; }
          75%  { top: 50%; left: 90%; opacity: 0.75; }
          95%  { opacity: 0.8; }
          100% { top: 10%; left: 50%; opacity: 0; }
        }

        .attr-panel {
          display: grid; grid-template-columns: 1fr 1fr 1fr;
          gap: 4px; margin-top: 8px;
        }
        .attr-item {
          background: rgba(255,255,255,0.04); border-radius: 6px;
          padding: 4px 6px; display: flex; flex-direction: column;
        }
        .attr-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; color: #999; margin-bottom: 1px; }
        .attr-value { font-size: 12px; font-weight: 500; color: #e0e0e0; }
        .attr-value.highlight { color: #ff9944; }
        .attr-value.timer { color: #66bbff; }

        .probe-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; }
        .probe-badge.active { color: #4caf50; }
        .probe-badge.inactive { color: #999; }

        .footer {
          margin-top: 4px; padding: 4px 4px 0;
          border-top: 1px solid rgba(255,255,255,0.06);
          display: flex; justify-content: space-between; align-items: center;
        }
        .entity-id { font-size: 9px; color: #444; font-family: monospace; }
      </style>

      <ha-card>
        <div class="oven-body">
          <div class="top-bar">
            <span class="brand">GE Profile</span>
            <span class="temp-range" data-field="tempRange"></span>
            <span class="oven-name" data-field="ovenName"></span>
          </div>

          <div class="lcd-bezel">
            <div class="lcd-screen" data-field="lcdScreen">
              <span class="oven-light" data-field="ovenLight">💡</span>
              <div class="lcd-row main">
                <div>
                  <span class="lcd-temp" data-field="lcdTemp"></span>
                  <span class="lcd-degree" data-field="lcdDegree">°F</span>
                </div>
                <span class="lcd-target" data-field="lcdRight"></span>
              </div>
              <div class="lcd-row">
                <span class="lcd-mode" data-field="lcdMode"></span>
                <span class="lcd-status" data-field="lcdStatus"></span>
              </div>
            </div>
          </div>

          <div class="door-frame">
            <div class="handle-bar"></div>
            <div class="oven-window" data-field="ovenWindow">
              <div class="heat-element top" data-field="elementTop"></div>
              <div class="window-spacer">
                <div class="conv-fan" data-field="convFan">
                  <div class="fan-ring" data-field="fanRing"></div>
                  <div class="fan-blades">
                    <div class="fan-blade b1"></div>
                    <div class="fan-blade b2"></div>
                    <div class="fan-blade b3"></div>
                    <div class="fan-blade b4"></div>
                    <div class="fan-blade b5"></div>
                    <div class="fan-blade b6"></div>
                  </div>
                  <div class="fan-hub"></div>
                </div>
                <div class="heat-waves-rising" data-field="wavesRising">
                  <div class="wave-rise r1">~</div>
                  <div class="wave-rise r2">~</div>
                  <div class="wave-rise r3">~</div>
                  <div class="wave-rise r4">~</div>
                  <div class="wave-rise r5">~</div>
                </div>
                <div class="heat-waves-falling" data-field="wavesFalling">
                  <div class="wave-fall f1">~</div>
                  <div class="wave-fall f2">~</div>
                  <div class="wave-fall f3">~</div>
                  <div class="wave-fall f4">~</div>
                  <div class="wave-fall f5">~</div>
                </div>
                <div class="heat-waves-convection" data-field="wavesConvection">
                  <div class="conv-wave w1">〰</div>
                  <div class="conv-wave w2">〰</div>
                  <div class="conv-wave w3">〰</div>
                  <div class="conv-wave w4">〰</div>
                  <div class="conv-wave w5">〰</div>
                  <div class="conv-wave w6">〰</div>
                </div>
              </div>
              <div class="heat-element bottom" data-field="elementBottom"></div>
            </div>

            <div class="attr-panel">
              <div class="attr-item">
                <span class="attr-label">Current</span>
                <span class="attr-value" data-field="attrCurrent"></span>
              </div>
              <div class="attr-item">
                <span class="attr-label">Target</span>
                <span class="attr-value" data-field="attrTarget"></span>
              </div>
              <div class="attr-item">
                <span class="attr-label">Probe</span>
                <span class="attr-value"><span class="probe-badge" data-field="attrProbe"></span></span>
              </div>
              <div class="attr-item">
                <span class="attr-label">Cook Timer</span>
                <span class="attr-value" data-field="attrCookTimer"></span>
              </div>
              <div class="attr-item">
                <span class="attr-label">Kitchen Timer</span>
                <span class="attr-value" data-field="attrKitchenTimer"></span>
              </div>
              <div class="attr-item">
                <span class="attr-label">Elapsed</span>
                <span class="attr-value" data-field="attrElapsed"></span>
              </div>
            </div>
          </div>

          <div class="footer">
            <span class="entity-id" data-field="footerEntity"></span>
            <span class="entity-id">v${GE_OVEN_CARD_VERSION}</span>
          </div>
        </div>
      </ha-card>
    `;
    this._rendered = true;
  }

  // Get a data-field element
  _el(field) {
    return this.shadowRoot.querySelector(`[data-field="${field}"]`);
  }

  // Update DOM in-place without replacing innerHTML (preserves animations)
  _update() {
    if (!this._hass || !this._config) return;

    const data = this._getDisplayData();
    if (!data) {
      this.shadowRoot.innerHTML = `<ha-card><div style="padding:16px;color:#ef5350;">Entity not found: ${this._config.entity}</div></ha-card>`;
      this._rendered = false;
      return;
    }

    // Build DOM on first render
    if (!this._rendered) {
      this._buildDom();
    }

    // Update text content and classes (no innerHTML replacement = no animation restart)
    this._el('tempRange').textContent = `${data.minTemp}°–${data.maxTemp}°`;
    this._el('ovenName').textContent = data.friendlyName;

    const lcdScreen = this._el('lcdScreen');
    lcdScreen.className = `lcd-screen ${data.isEngaged ? 'active' : ''}`;

    const ovenLight = this._el('ovenLight');
    ovenLight.className = `oven-light ${data.lightOn ? 'visible' : ''}`;

    const lcdTemp = this._el('lcdTemp');
    lcdTemp.textContent = data.isDelay ? 'DELAY' : data.lcdTemp;
    lcdTemp.className = `lcd-temp ${data.isEngaged ? '' : 'off'}`;

    const lcdDegree = this._el('lcdDegree');
    lcdDegree.style.display = data.isDelay ? 'none' : '';
    lcdDegree.className = `lcd-degree ${data.isEngaged ? '' : 'off'}`;

    this._el('lcdRight').textContent = data.lcdRight;

    const lcdMode = this._el('lcdMode');
    lcdMode.textContent = data.lcdModeText;
    lcdMode.className = `lcd-mode ${data.isEngaged ? '' : 'off'}`;

    this._el('lcdStatus').textContent = data.lcdStatusRight;

    // Window
    const ovenWindow = this._el('ovenWindow');
    ovenWindow.className = `oven-window ${data.isActive ? 'active' : ''}`;

    // Elements — toggle on/off class
    this._el('elementTop').className = `heat-element top ${data.showTopElement ? 'on' : 'off'}`;
    this._el('elementBottom').className = `heat-element bottom ${data.showBottomElement ? 'on' : 'off'}`;

    // Fan visibility + rear element glow on ring
    this._el('convFan').className = `conv-fan ${data.showConvFan ? 'visible' : ''}`;
    this._el('fanRing').className = `fan-ring ${(data.isActive && data.isConvection) ? 'element-on' : ''}`;

    // Wave visibility
    this._el('wavesRising').className = `heat-waves-rising ${(data.isActive && !data.isConvection && data.hasBottomElement) ? 'visible' : ''}`;
    this._el('wavesFalling').className = `heat-waves-falling ${(data.isActive && !data.isConvection && data.hasTopElement) ? 'visible' : ''}`;
    this._el('wavesConvection').className = `heat-waves-convection ${(data.isActive && data.isConvection) ? 'visible' : ''}`;

    // Attributes
    const attrCurrent = this._el('attrCurrent');
    attrCurrent.textContent = data.currentFormatted;
    attrCurrent.className = `attr-value ${data.isEngaged ? 'highlight' : ''}`;

    const attrTarget = this._el('attrTarget');
    attrTarget.textContent = data.targetFormatted;
    attrTarget.className = `attr-value ${data.isEngaged ? 'highlight' : ''}`;

    const attrProbe = this._el('attrProbe');
    attrProbe.textContent = data.probeDisplay;
    attrProbe.className = `probe-badge ${data.probeClass}`;

    const attrCookTimer = this._el('attrCookTimer');
    attrCookTimer.textContent = data.cookTime;
    attrCookTimer.className = `attr-value ${data.cookTimeActive ? 'timer' : ''}`;

    const attrKitchenTimer = this._el('attrKitchenTimer');
    attrKitchenTimer.textContent = data.kitchenTimer;
    attrKitchenTimer.className = `attr-value ${data.kitchenTimerActive ? 'timer' : ''}`;

    const attrElapsed = this._el('attrElapsed');
    attrElapsed.textContent = data.elapsed;
    attrElapsed.className = `attr-value ${data.elapsedActive ? 'timer' : ''}`;

    this._el('footerEntity').textContent = data.entityId;
  }
}

customElements.define('ge-oven-card', GeOvenCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ge-oven-card',
  name: 'GE Oven Card',
  description: 'Status card for GE Profile ovens via SmartHQ integration',
  preview: true,
});

console.log(`GE Oven Card v${GE_OVEN_CARD_VERSION}: registered.`);

const GE_WASHER_CARD_VERSION = '1.4.1';
console.log(`GE Washer Card v${GE_WASHER_CARD_VERSION}: loading...`);

class GeWasherCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = null;
    this._rendered = false;
  }

  setConfig(config) {
    if (!config.prefix) {
      throw new Error('You need to define a "prefix" (e.g. "sensor.hasvr1_ge_washer_laundry")');
    }
    this._config = {
      prefix: config.prefix.replace(/\/$/, ''),
      name: config.name || 'GE Washer',
    };
    this._rendered = false;
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  getCardSize() { return 7; }
  static getConfigElement() { return null; }
  static getStubConfig() {
    return { prefix: 'sensor.hasvr1_ge_washer_laundry', name: 'GE Washer' };
  }

  _getState(suffix) {
    if (!this._hass) return null;
    const entity = this._hass.states[`${this._config.prefix}_${suffix}`];
    return entity ? entity.state : null;
  }

  _getBinary(suffix) {
    if (!this._hass) return null;
    const binaryId = this._config.prefix.replace('sensor.', 'binary_sensor.') + '_' + suffix;
    const entity = this._hass.states[binaryId];
    return entity ? entity.state : null;
  }

  _tempColor(tempLevel) {
    const map = {
      'cold':       { color: '#2266dd', glow: 'rgba(34,102,221,0.4)' },
      'tap cold':   { color: '#3388ee', glow: 'rgba(51,136,238,0.4)' },
      'cool':       { color: '#44aaee', glow: 'rgba(68,170,238,0.4)' },
      'colors':     { color: '#55bbcc', glow: 'rgba(85,187,204,0.4)' },
      'warm':       { color: '#ddaa22', glow: 'rgba(221,170,34,0.4)' },
      'hot':        { color: '#dd6622', glow: 'rgba(221,102,34,0.4)' },
      'extra hot':  { color: '#cc3311', glow: 'rgba(204,51,17,0.4)' },
    };
    return map[(tempLevel || '').toLowerCase()] || { color: '#555', glow: 'rgba(85,85,85,0.2)' };
  }

  _formatTime(seconds) {
    const s = parseFloat(seconds);
    if (!s || s <= 0) return '--';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  // Gather all display data from current state
  _getDisplayData() {
    const machineState = this._getState('machine_state') || 'Off';
    const cycle = this._getState('cycle') || '--';
    const subCycle = this._getState('sub_cycle') || '---';
    const timeRemaining = this._getState('time_remaining');
    const delayRemaining = this._getState('delay_time_remaining');
    const washTemp = this._getState('washer_washtemp_level') || '--';
    const spinTime = this._getState('washer_spintime_level') || '--';
    const soilLevel = this._getState('washer_soil_level') || '--';
    const rinseOption = this._getState('washer_rinse_option') || '---';
    const dispensLoads = this._getState('washer_smart_dispense_loads_left');
    const dispensTank = this._getState('washer_smart_dispense_tank_status') || '--';

    const doorOpen = this._getBinary('door') === 'on';
    const doorLocked = this._getBinary('washer_door_lock') === 'on';
    const prewash = this._getBinary('washer_prewash') === 'on';

    const isActive = machineState.toLowerCase() !== 'off';
    const isDelay = delayRemaining && parseFloat(delayRemaining) > 0;
    const isSpin = subCycle.toLowerCase().includes('spin');
    const isRinse = subCycle.toLowerCase().includes('rinse');
    const isFill = subCycle.toLowerCase() === 'fill';
    const isLocked = doorLocked || (isActive && !doorOpen);
    const tc = this._tempColor(washTemp);

    // Drum animation classes
    let drumClass = 'drum-inner';
    let agitatorClass = 'agitator';
    if (isActive && isSpin) {
      drumClass += ' spinning';
      agitatorClass += ' spinning';
    } else if (isActive) {
      agitatorClass += ' agitating';
    }

    // LCD text
    let lcdCycleText = isDelay ? 'DELAY' : (isActive ? cycle : 'OFF');
    let lcdTimeText = '';
    if (isDelay) {
      lcdTimeText = this._formatTime(delayRemaining);
    } else if (isActive && timeRemaining) {
      lcdTimeText = this._formatTime(timeRemaining);
    }
    let lcdSubText = isActive ? (subCycle !== '---' ? subCycle : machineState) : machineState;

    return {
      isActive, isDelay, isSpin, isRinse, isFill, isLocked,
      doorOpen, prewash,
      tc,
      drumClass, agitatorClass,
      lcdCycleText, lcdTimeText, lcdSubText,
      washTemp, spinTime, soilLevel,
      rinseOption: rinseOption !== '---' ? rinseOption : '--',
      dispensTank,
      dispensLoads: dispensLoads != null ? dispensLoads : '--',
      dispensTankWarn: dispensTank !== 'Full',
    };
  }

  // Build initial DOM (called once)
  _buildDom() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          background: linear-gradient(175deg, #1a1a1e 0%, #0d0d10 100%);
          border: 1px solid #2a2a30;
          border-radius: 16px;
          overflow: hidden;
          font-family: 'Segoe UI', Roboto, sans-serif;
          color: #e0e0e0;
          padding: 0;
        }
        .body { padding: 16px 16px 10px; }

        /* Top bar */
        .top-bar {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 10px;
        }
        .brand { font-size: 11px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #888; }
        .name { font-size: 13px; font-weight: 500; color: #aaa; }

        /* LCD */
        .lcd-bezel {
          background: #050508; border: 2px solid #333; border-radius: 8px;
          padding: 3px; margin-bottom: 14px;
          box-shadow: inset 0 2px 8px rgba(0,0,0,0.8);
        }
        .lcd-screen {
          background: linear-gradient(180deg, #080a1a 0%, #0d1025 50%, #080a1a 100%);
          border-radius: 5px; padding: 12px 16px; position: relative; overflow: hidden;
          min-height: 70px; display: flex; flex-direction: column; justify-content: center;
        }
        .lcd-screen.active {
          background: linear-gradient(180deg, #080a1a 0%, #101830 50%, #080a1a 100%);
        }
        .lcd-screen::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px);
          pointer-events: none; z-index: 1;
        }
        .lcd-row { display: flex; align-items: baseline; justify-content: space-between; position: relative; z-index: 2; }
        .lcd-row.main { margin-bottom: 4px; }
        .lcd-cycle {
          font-family: 'Courier New', monospace; font-size: 28px; font-weight: 700;
          color: #66bbff; text-shadow: 0 0 12px rgba(102,187,255,0.6);
          line-height: 1; letter-spacing: 1px; text-transform: uppercase;
        }
        .lcd-cycle.off { color: #5599cc; text-shadow: 0 0 8px rgba(85,153,204,0.4); }
        .lcd-time {
          font-family: 'Courier New', monospace; font-size: 22px;
          color: #55aaee; text-shadow: 0 0 8px rgba(85,170,238,0.4); opacity: 0.9;
        }
        .lcd-sub {
          font-family: 'Courier New', monospace; font-size: 14px;
          color: #5599dd; text-shadow: 0 0 6px rgba(85,153,221,0.4);
          text-transform: uppercase; letter-spacing: 1px;
        }
        .lcd-sub.off { color: #6699cc; text-shadow: 0 0 6px rgba(102,153,204,0.4); }
        .lcd-state {
          font-family: 'Courier New', monospace; font-size: 12px;
          color: #55aaee; text-shadow: 0 0 4px rgba(85,170,238,0.4);
        }

        /* LCD badge for prewash */
        .lcd-badge {
          font-family: 'Courier New', monospace; font-size: 10px;
          color: #55aaee; text-shadow: 0 0 4px rgba(85,170,238,0.4);
          letter-spacing: 1px; text-transform: uppercase;
        }

        /* Machine body */
        .machine-body {
          border: 2px solid #3a3a40; border-radius: 14px;
          padding: 12px; margin-bottom: 8px;
          background: linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.1) 100%);
          display: flex; flex-direction: column; align-items: center;
        }

        /* Drum container */
        .drum-container {
          position: relative; width: 200px; height: 200px; margin: 8px 0;
        }
        /* Outer door ring */
        .door-ring {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          border-radius: 50%;
          background: conic-gradient(from 0deg, #555, #777, #999, #888, #666, #555);
          box-shadow: 0 4px 12px rgba(0,0,0,0.5), inset 0 0 20px rgba(0,0,0,0.3);
        }
        /* Door glass — uses CSS custom properties for dynamic color */
        .door-glass {
          position: absolute; top: 8px; left: 8px; right: 8px; bottom: 8px;
          border-radius: 50%;
          background: radial-gradient(circle, #1a1a1e 0%, #0d0d10 100%);
          box-shadow: inset 0 4px 16px rgba(0,0,0,0.6);
          overflow: hidden;
        }
        .door-glass.active {
          background: radial-gradient(circle at 40% 40%, var(--tc-color-22) 0%, var(--tc-color-11) 40%, #0d0d10 100%);
          box-shadow: inset 0 0 40px var(--tc-glow), inset 0 4px 16px rgba(0,0,0,0.4);
        }

        /* Inner drum */
        .drum-inner {
          position: absolute; top: 16px; left: 16px; right: 16px; bottom: 16px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .drum-inner.spinning {
          animation: drumSpin 1.5s linear infinite;
        }

        /* Agitator */
        .agitator {
          position: absolute; top: 50%; left: 50%;
          width: 100%; height: 100%;
          transform: translate(-50%, -50%);
        }
        .agitator.spinning {
          animation: drumSpin 1.5s linear infinite;
        }
        .agitator.agitating {
          animation: agitate 2s ease-in-out infinite;
        }

        /* Paddles */
        .paddle {
          position: absolute; top: 50%; left: 50%;
          width: 4px; height: 40%;
          background: linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%);
          border-radius: 2px;
          transform-origin: center top;
        }
        .paddle:nth-child(1) { transform: translate(-50%, 0) rotate(0deg); }
        .paddle:nth-child(2) { transform: translate(-50%, 0) rotate(120deg); }
        .paddle:nth-child(3) { transform: translate(-50%, 0) rotate(240deg); }
        .paddle.active {
          background: linear-gradient(180deg, var(--tc-color-55) 0%, var(--tc-color-22) 100%);
        }

        /* Drum perforations */
        .perf-ring {
          position: absolute; top: 20px; left: 20px; right: 20px; bottom: 20px;
          border-radius: 50%;
          border: 1px dashed rgba(255,255,255,0.06);
        }

        /* Center hub */
        .hub {
          position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
          width: 20px; height: 20px; border-radius: 50%;
          background: radial-gradient(circle, #444 0%, #222 100%);
          border: 1px solid #555;
        }

        @keyframes drumSpin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes agitate {
          0%, 100% { transform: translate(-50%, -50%) rotate(-15deg); }
          50% { transform: translate(-50%, -50%) rotate(15deg); }
        }

        /* Temperature glow ring — uses CSS custom properties */
        .glow-ring {
          position: absolute; top: 4px; left: 4px; right: 4px; bottom: 4px;
          border-radius: 50%; border: 2px solid transparent;
          display: none;
        }
        .glow-ring.active {
          display: block;
          border-color: var(--tc-color-66);
          box-shadow: 0 0 15px var(--tc-glow), inset 0 0 15px var(--tc-glow);
          animation: glowPulse 3s ease-in-out infinite;
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }

        /* Door handle */
        .door-handle {
          position: absolute; top: 50%; right: -14px; transform: translateY(-50%);
          width: 10px; height: 50px; border-radius: 5px;
          background: linear-gradient(90deg, #666 0%, #444 50%, #555 100%);
          box-shadow: 2px 2px 4px rgba(0,0,0,0.4);
        }
        .door-handle.open {
          background: linear-gradient(90deg, #ff9933 0%, #cc7722 50%, #ff9933 100%);
          box-shadow: 2px 2px 4px rgba(0,0,0,0.4), 0 0 8px rgba(255, 153, 51, 0.4);
        }

        /* Door lock icon */
        .lock-icon {
          position: absolute; top: 50%; right: -28px; transform: translateY(-50%);
          font-size: 12px; color: #4caf50; z-index: 5;
          filter: drop-shadow(0 0 4px rgba(76, 175, 80, 0.5));
          display: none;
        }
        .lock-icon.visible { display: block; }

        /* Water fill icon */
        .fill-icon {
          position: absolute; top: 14px; left: 16px;
          font-size: 16px; z-index: 5;
          color: #55aaee;
          filter: drop-shadow(0 0 6px rgba(85, 170, 238, 0.6));
          animation: fillPulse 1.5s ease-in-out infinite;
          display: none;
        }
        .fill-icon.visible { display: block; }
        @keyframes fillPulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }

        /* Water level indicator — uses CSS custom properties */
        .water-level {
          position: absolute; bottom: 8px; left: 8px; right: 8px;
          height: 0; border-radius: 0 0 50% 50%;
          background: linear-gradient(180deg, var(--tc-color-15) 0%, var(--tc-color-08) 100%);
          transition: height 0.5s ease;
          display: none;
        }
        .water-level.active {
          display: block;
          height: 35%;
          animation: waterSlosh 3s ease-in-out infinite;
        }
        @keyframes waterSlosh {
          0%, 100% { transform: rotate(-1deg); }
          50% { transform: rotate(1deg); }
        }

        /* Sensor grid */
        .sensor-grid {
          display: grid; grid-template-columns: 1fr 1fr 1fr;
          gap: 4px; width: 100%; margin-top: 8px;
        }
        .sensor-item {
          background: rgba(255,255,255,0.04); border-radius: 6px;
          padding: 4px 6px; display: flex; flex-direction: column;
        }
        .sensor-label {
          font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px;
          color: #999; margin-bottom: 1px;
        }
        .sensor-value { font-size: 11px; font-weight: 500; color: #e0e0e0; }
        .sensor-value.highlight { color: var(--tc-color); }
        .sensor-value.warn { color: #ff9944; }

        /* Footer */
        .footer {
          margin-top: 4px; padding: 4px 4px 0;
          border-top: 1px solid rgba(255,255,255,0.06);
          display: flex; justify-content: space-between; align-items: center;
        }
        .entity-id { font-size: 9px; color: #444; font-family: monospace; }
      </style>

      <ha-card>
        <div class="body">
          <div class="top-bar">
            <span class="brand">GE Profile</span>
            <span class="name" data-field="name"></span>
          </div>

          <div class="lcd-bezel">
            <div class="lcd-screen" data-field="lcdScreen">
              <div class="lcd-row main">
                <span class="lcd-cycle" data-field="lcdCycle"></span>
                <span class="lcd-time" data-field="lcdTime"></span>
              </div>
              <div class="lcd-row">
                <span class="lcd-sub" data-field="lcdSub"></span>
                <span>
                  <span class="lcd-badge" data-field="lcdPrewash"></span>
                  <span class="lcd-state" data-field="lcdState"></span>
                </span>
              </div>
            </div>
          </div>

          <div class="machine-body">
            <div class="drum-container">
              <div class="door-ring"></div>
              <div class="glow-ring" data-field="glowRing"></div>
              <div class="door-glass" data-field="doorGlass">
                <span class="fill-icon" data-field="fillIcon" title="Filling">💧</span>
                <div class="water-level" data-field="waterLevel"></div>
                <div class="drum-inner" data-field="drumInner">
                  <div class="perf-ring"></div>
                  <div class="agitator" data-field="agitator">
                    <div class="paddle" data-field="paddle1"></div>
                    <div class="paddle" data-field="paddle2"></div>
                    <div class="paddle" data-field="paddle3"></div>
                  </div>
                  <div class="hub"></div>
                </div>
              </div>
              <div class="door-handle" data-field="doorHandle"></div>
              <span class="lock-icon" data-field="lockIcon" title="Door Locked">🔒</span>
            </div>

            <div class="sensor-grid">
              <div class="sensor-item">
                <span class="sensor-label">Temp</span>
                <span class="sensor-value" data-field="sensorTemp"></span>
              </div>
              <div class="sensor-item">
                <span class="sensor-label">Spin</span>
                <span class="sensor-value" data-field="sensorSpin"></span>
              </div>
              <div class="sensor-item">
                <span class="sensor-label">Soil</span>
                <span class="sensor-value" data-field="sensorSoil"></span>
              </div>
              <div class="sensor-item">
                <span class="sensor-label">Rinse</span>
                <span class="sensor-value" data-field="sensorRinse"></span>
              </div>
              <div class="sensor-item">
                <span class="sensor-label">Dispense</span>
                <span class="sensor-value" data-field="sensorDispense"></span>
              </div>
              <div class="sensor-item">
                <span class="sensor-label">Loads Left</span>
                <span class="sensor-value" data-field="sensorLoads"></span>
              </div>
            </div>
          </div>

          <div class="footer">
            <span class="entity-id" data-field="footerEntity"></span>
            <span class="entity-id">v${GE_WASHER_CARD_VERSION}</span>
          </div>
        </div>
      </ha-card>
    `;
    this._rendered = true;
  }

  // Get a data-field element
  _el(field) {
    return this.shadowRoot?.querySelector(`[data-field="${field}"]`);
  }

  // Update DOM in-place without replacing innerHTML (preserves animations)
  _update() {
    if (!this._hass || !this._config) return;

    // Build DOM on first render
    if (!this._rendered) {
      this._buildDom();
    }

    const d = this._getDisplayData();

    // Update CSS custom properties for dynamic temperature colors
    const host = this.shadowRoot.host;
    host.style.setProperty('--tc-color', d.tc.color);
    host.style.setProperty('--tc-glow', d.tc.glow);
    host.style.setProperty('--tc-color-66', d.tc.color + '66');
    host.style.setProperty('--tc-color-55', d.tc.color + '55');
    host.style.setProperty('--tc-color-22', d.tc.color + '22');
    host.style.setProperty('--tc-color-15', d.tc.color + '15');
    host.style.setProperty('--tc-color-11', d.tc.color + '11');
    host.style.setProperty('--tc-color-08', d.tc.color + '08');

    // Top bar
    this._el('name').textContent = this._config.name;

    // LCD
    const lcdScreen = this._el('lcdScreen');
    lcdScreen.className = `lcd-screen ${d.isActive ? 'active' : ''}`;

    const lcdCycle = this._el('lcdCycle');
    lcdCycle.textContent = d.lcdCycleText;
    lcdCycle.className = `lcd-cycle ${d.isActive ? '' : 'off'}`;

    const lcdTime = this._el('lcdTime');
    lcdTime.textContent = d.lcdTimeText;
    lcdTime.style.display = d.lcdTimeText ? '' : 'none';

    const lcdSub = this._el('lcdSub');
    lcdSub.textContent = d.lcdSubText;
    lcdSub.className = `lcd-sub ${d.isActive ? '' : 'off'}`;

    this._el('lcdPrewash').textContent = d.prewash ? 'PRE ' : '';
    const lcdState = this._el('lcdState');
    lcdState.textContent = d.isActive ? d.washTemp : '';
    lcdState.style.display = d.isActive ? '' : 'none';

    // Glow ring
    this._el('glowRing').className = `glow-ring ${d.isActive ? 'active' : ''}`;

    // Door glass
    this._el('doorGlass').className = `door-glass ${d.isActive ? 'active' : ''}`;

    // Fill icon
    this._el('fillIcon').className = `fill-icon ${d.isFill ? 'visible' : ''}`;

    // Water level
    this._el('waterLevel').className = `water-level ${(d.isActive && !d.isSpin) ? 'active' : ''}`;

    // Drum and agitator — update class to toggle animations via CSS
    this._el('drumInner').className = d.drumClass;
    this._el('agitator').className = d.agitatorClass;

    // Paddles
    const paddleClass = `paddle ${d.isActive ? 'active' : ''}`;
    this._el('paddle1').className = paddleClass;
    this._el('paddle2').className = paddleClass;
    this._el('paddle3').className = paddleClass;

    // Door handle
    this._el('doorHandle').className = `door-handle ${d.doorOpen ? 'open' : ''}`;

    // Lock icon
    this._el('lockIcon').className = `lock-icon ${d.isLocked ? 'visible' : ''}`;

    // Sensor grid
    const sensorTemp = this._el('sensorTemp');
    sensorTemp.textContent = d.washTemp;
    sensorTemp.className = `sensor-value ${d.isActive ? 'highlight' : ''}`;

    this._el('sensorSpin').textContent = d.spinTime;
    this._el('sensorSoil').textContent = d.soilLevel;
    this._el('sensorRinse').textContent = d.rinseOption;

    const sensorDispense = this._el('sensorDispense');
    sensorDispense.textContent = d.dispensTank;
    sensorDispense.className = `sensor-value ${d.dispensTankWarn ? 'warn' : ''}`;

    this._el('sensorLoads').textContent = d.dispensLoads;

    // Footer
    this._el('footerEntity').textContent = this._config.prefix;
  }
}

customElements.define('ge-washer-card', GeWasherCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ge-washer-card',
  name: 'GE Washer Card',
  description: 'Status card for GE Profile front-load washers via SmartHQ',
  preview: true,
});
console.log(`GE Washer Card v${GE_WASHER_CARD_VERSION}: registered.`);

const GE_DRYER_CARD_VERSION = '1.6.1';
console.log(`GE Dryer Card v${GE_DRYER_CARD_VERSION}: loading...`);

class GeDryerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = null;
    this._rendered = false;
  }

  setConfig(config) {
    if (!config.prefix) {
      throw new Error('You need to define a "prefix" (e.g. "sensor.hasvr1_ge_dryer_laundry")');
    }
    this._config = {
      prefix: config.prefix.replace(/\/$/, ''),
      name: config.name || 'GE Dryer',
      sheets: config.sheets !== false && config.sheets !== 'false',
    };
    this._rendered = false; // force full re-render on config change
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  getCardSize() { return 7; }
  static getConfigElement() { return null; }
  static getStubConfig() {
    return { prefix: 'sensor.hasvr1_ge_dryer_laundry', name: 'GE Dryer' };
  }

  _getState(suffix) {
    if (!this._hass) return null;
    const entity = this._hass.states[`${this._config.prefix}_${suffix}`];
    if (entity) return entity.state;
    // Handle the inconsistent tumble_status entity naming
    const alt = this._hass.states[`${this._config.prefix.replace('_laundry', 'laundry')}_${suffix}`];
    return alt ? alt.state : null;
  }

  _getBinary(suffix) {
    if (!this._hass) return null;
    const binaryId = this._config.prefix.replace('sensor.', 'binary_sensor.') + '_' + suffix;
    const entity = this._hass.states[binaryId];
    return entity ? entity.state : null;
  }

  _tempColor(tempLevel) {
    const map = {
      'no heat':    { color: '#4488bb', glow: 'rgba(68,136,187,0.4)' },
      'air fluff':  { color: '#4488bb', glow: 'rgba(68,136,187,0.4)' },
      'extra low':  { color: '#55aacc', glow: 'rgba(85,170,204,0.4)' },
      'low':        { color: '#66bbaa', glow: 'rgba(102,187,170,0.4)' },
      'medium low': { color: '#cc9922', glow: 'rgba(204,153,34,0.5)' },
      'medium':     { color: '#ee8811', glow: 'rgba(238,136,17,0.5)' },
      'high':       { color: '#ff6600', glow: 'rgba(255,102,0,0.6)' },
      'extra high': { color: '#ff3300', glow: 'rgba(255,51,0,0.6)' },
    };
    return map[(tempLevel || '').toLowerCase()] || { color: '#555', glow: 'rgba(85,85,85,0.2)' };
  }

  _formatTime(seconds) {
    const s = parseFloat(seconds);
    if (!s || s <= 0) return '--';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  // Gather all display values from current state
  _getDisplayData() {
    const machineState = this._getState('machine_state') || 'Off';
    const cycle = this._getState('cycle') || '--';
    const subCycle = this._getState('sub_cycle') || '---';
    const timeRemaining = this._getState('time_remaining');
    const delayRemaining = this._getState('delay_time_remaining');
    const tempOption = this._getState('dryer_temperaturenew_option') || '--';
    const drynessLevel = this._getState('dryer_drynessnew_level') || '--';
    const ecoDry = this._getState('dryer_ecodry_option_selection') || '--';
    const extTumble = this._getState('dryer_extended_tumble_option_selection') || '--';
    const sheetInventory = this._getState('dryer_sheet_inventory');
    const tumbleStatus = this._getState('dryer_tumble_status') || '--';

    // Binary sensors
    const doorOpen = this._getBinary('door') === 'on';
    const ventBlocked = this._getBinary('dryer_blocked_vent_fault') === 'on';
    const washerLink = this._getBinary('dryer_washerlink_status') === 'on';

    const isActive = machineState.toLowerCase() !== 'off';
    const isDelay = delayRemaining && parseFloat(delayRemaining) > 0;
    const isSteam = cycle.toLowerCase().includes('steam') || subCycle.toLowerCase().includes('steam');
    const tc = this._tempColor(tempOption);

    // LCD values
    const lcdCycle = isDelay ? 'DELAY' : (isActive ? cycle : 'OFF');
    let lcdTime = '';
    if (isDelay) {
      lcdTime = this._formatTime(delayRemaining);
    } else if (isActive && timeRemaining) {
      lcdTime = this._formatTime(timeRemaining);
    }
    const lcdSub = isActive ? (subCycle !== '---' ? subCycle : machineState) : machineState;

    // Sensor values
    const ecoDryOn = ecoDry.toLowerCase() !== 'disabled';
    const extTumbleOn = extTumble.toLowerCase() !== 'disable' && extTumble.toLowerCase() !== 'disabled';
    const tumbleOn = tumbleStatus.toLowerCase() !== 'disable' && tumbleStatus.toLowerCase() !== 'disabled';

    let sheetsOrLinkLabel, sheetsOrLinkValue, sheetsOrLinkHighlight;
    if (this._config.sheets) {
      sheetsOrLinkLabel = 'Sheets';
      sheetsOrLinkValue = sheetInventory != null && sheetInventory !== '0' ? sheetInventory : '--';
      sheetsOrLinkHighlight = false;
    } else {
      sheetsOrLinkLabel = 'WasherLink';
      sheetsOrLinkValue = washerLink ? 'Linked' : 'Off';
      sheetsOrLinkHighlight = washerLink;
    }

    return {
      isActive, isDelay, isSteam, tc, doorOpen, ventBlocked,
      lcdCycle, lcdTime, lcdSub, tempOption,
      drynessLevel,
      ecoDryOn, extTumbleOn, tumbleOn, isSteamLabel: isSteam,
      sheetsOrLinkLabel, sheetsOrLinkValue, sheetsOrLinkHighlight,
    };
  }

  // Build initial DOM structure (only once)
  _buildDom() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          background: linear-gradient(175deg, #1a1a1e 0%, #0d0d10 100%);
          border: 1px solid #2a2a30; border-radius: 16px; overflow: hidden;
          font-family: 'Segoe UI', Roboto, sans-serif; color: #e0e0e0; padding: 0;
        }
        .body { padding: 16px 16px 10px; }

        /* Top bar */
        .top-bar {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 10px;
        }
        .brand { font-size: 11px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #888; }
        .name { font-size: 13px; font-weight: 500; color: #aaa; }

        /* LCD */
        .lcd-bezel {
          background: #050508; border: 2px solid #333; border-radius: 8px;
          padding: 3px; margin-bottom: 14px;
          box-shadow: inset 0 2px 8px rgba(0,0,0,0.8);
        }
        .lcd-screen {
          background: linear-gradient(180deg, #080a1a 0%, #0d1025 50%, #080a1a 100%);
          border-radius: 5px; padding: 12px 16px; position: relative; overflow: hidden;
          min-height: 70px; display: flex; flex-direction: column; justify-content: center;
        }
        .lcd-screen.active {
          background: linear-gradient(180deg, #080a1a 0%, #101830 50%, #080a1a 100%);
        }
        .lcd-screen::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px);
          pointer-events: none; z-index: 1;
        }
        .lcd-row { display: flex; align-items: baseline; justify-content: space-between; position: relative; z-index: 2; }
        .lcd-row.main { margin-bottom: 4px; }
        .lcd-cycle {
          font-family: 'Courier New', monospace; font-size: 28px; font-weight: 700;
          color: #66bbff; text-shadow: 0 0 12px rgba(102,187,255,0.6);
          line-height: 1; letter-spacing: 1px; text-transform: uppercase;
        }
        .lcd-cycle.off { color: #5599cc; text-shadow: 0 0 8px rgba(85,153,204,0.4); }
        .lcd-time {
          font-family: 'Courier New', monospace; font-size: 22px;
          color: #55aaee; text-shadow: 0 0 8px rgba(85,170,238,0.4); opacity: 0.9;
        }
        .lcd-sub {
          font-family: 'Courier New', monospace; font-size: 14px;
          color: #5599dd; text-shadow: 0 0 6px rgba(85,153,221,0.4);
          text-transform: uppercase; letter-spacing: 1px;
        }
        .lcd-sub.off { color: #6699cc; text-shadow: 0 0 6px rgba(102,153,204,0.4); }
        .lcd-state {
          font-family: 'Courier New', monospace; font-size: 12px;
          color: #55aaee; text-shadow: 0 0 4px rgba(85,170,238,0.4);
        }

        /* Machine body */
        .machine-body {
          border: 2px solid #3a3a40; border-radius: 14px;
          padding: 12px; margin-bottom: 8px;
          background: linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.1) 100%);
          display: flex; flex-direction: column; align-items: center;
        }

        /* Drum container */
        .drum-container {
          position: relative; width: 200px; height: 200px; margin: 8px 0;
        }
        .door-ring {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          border-radius: 50%;
          background: conic-gradient(from 0deg, #555, #777, #999, #888, #666, #555);
          box-shadow: 0 4px 12px rgba(0,0,0,0.5), inset 0 0 20px rgba(0,0,0,0.3);
        }
        .door-glass {
          position: absolute; top: 8px; left: 8px; right: 8px; bottom: 8px;
          border-radius: 50%;
          background: radial-gradient(circle, #1a1a1e 0%, #0d0d10 100%);
          box-shadow: inset 0 4px 16px rgba(0,0,0,0.6);
          overflow: hidden;
        }
        /* door-glass active state applied via inline style for dynamic color */

        /* Drum with wall-mounted lifter bars */
        .drum-inner {
          position: absolute; top: 16px; left: 16px; right: 16px; bottom: 16px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .drum-inner.spinning {
          animation: drumSpin 4s linear infinite;
        }
        /* Lifter bars — short radial fins mounted on the drum wall */
        .lifter {
          position: absolute;
          top: 50%; left: 50%;
          width: 6px; height: 20px;
          margin-left: -3px;
          margin-top: -74px;
          transform-origin: 3px 74px;
          background: linear-gradient(180deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.06) 100%);
          border-radius: 3px;
        }
        /* lifter active state applied via inline style for dynamic color */
        .lifter:nth-child(2) { transform: rotate(90deg); }
        .lifter:nth-child(3) { transform: rotate(180deg); }
        .lifter:nth-child(4) { transform: rotate(270deg); }

        .perf-ring {
          position: absolute; top: 16px; left: 16px; right: 16px; bottom: 16px;
          border-radius: 50%; border: 1px dashed rgba(255,255,255,0.06);
        }

        @keyframes drumSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Temperature glow ring */
        .glow-ring {
          position: absolute; top: 4px; left: 4px; right: 4px; bottom: 4px;
          border-radius: 50%; border: 2px solid transparent; display: none;
        }
        .glow-ring.active {
          display: block;
          animation: glowPulse 3s ease-in-out infinite;
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }

        /* Steam effect */
        .steam-container {
          position: absolute; top: 15%; left: 30%; width: 40%; height: 50%;
          display: none;
          pointer-events: none;
        }
        .steam-container.visible { display: block; }
        .steam-wisp {
          position: absolute; bottom: 0; width: 3px;
          background: linear-gradient(to top, transparent, rgba(200,220,255,0.3), transparent);
          border-radius: 50%;
          animation: steamRise 2s ease-out infinite;
        }
        .steam-wisp:nth-child(1) { left: 20%; height: 30px; animation-delay: 0s; }
        .steam-wisp:nth-child(2) { left: 45%; height: 25px; animation-delay: 0.5s; }
        .steam-wisp:nth-child(3) { left: 70%; height: 35px; animation-delay: 1s; }
        .steam-wisp:nth-child(4) { left: 35%; height: 20px; animation-delay: 1.5s; }
        .steam-wisp:nth-child(5) { left: 60%; height: 28px; animation-delay: 0.8s; }
        @keyframes steamRise {
          0% { opacity: 0; transform: translateY(0) scaleX(1); }
          30% { opacity: 0.6; }
          70% { opacity: 0.3; transform: translateY(-30px) scaleX(1.8); }
          100% { opacity: 0; transform: translateY(-50px) scaleX(2.5); }
        }

        /* Door handle */
        .door-handle {
          position: absolute; top: 50%; left: -14px; transform: translateY(-50%);
          width: 10px; height: 50px; border-radius: 5px;
          background: linear-gradient(90deg, #555 0%, #444 50%, #666 100%);
          box-shadow: -2px 2px 4px rgba(0,0,0,0.4);
        }
        .door-handle.open {
          background: linear-gradient(90deg, #ff9933 0%, #cc7722 50%, #ff9933 100%);
          box-shadow: -2px 2px 4px rgba(0,0,0,0.4), 0 0 8px rgba(255, 153, 51, 0.4);
        }

        /* Vent warning */
        .vent-warning {
          display: none; align-items: center; gap: 6px;
          background: rgba(255, 50, 50, 0.15); border: 1px solid rgba(255, 50, 50, 0.3);
          border-radius: 8px; padding: 6px 10px; margin-bottom: 8px;
          font-size: 12px; color: #ff6644;
          animation: ventPulse 2s ease-in-out infinite;
        }
        .vent-warning.visible { display: flex; }
        .vent-warning-icon { font-size: 16px; }
        @keyframes ventPulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }

        /* Sensor grid */
        .sensor-grid {
          display: grid; grid-template-columns: 1fr 1fr 1fr;
          gap: 4px; width: 100%; margin-top: 8px;
        }
        .sensor-item {
          background: rgba(255,255,255,0.04); border-radius: 6px;
          padding: 4px 6px; display: flex; flex-direction: column;
        }
        .sensor-label {
          font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px;
          color: #999; margin-bottom: 1px;
        }
        .sensor-value { font-size: 11px; font-weight: 500; color: #e0e0e0; }
        .sensor-value.highlight { color: var(--dryer-tc-color, #555); }

        /* Footer */
        .footer {
          margin-top: 4px; padding: 4px 4px 0;
          border-top: 1px solid rgba(255,255,255,0.06);
          display: flex; justify-content: space-between; align-items: center;
        }
        .entity-id { font-size: 9px; color: #444; font-family: monospace; }
      </style>

      <ha-card>
        <div class="body">
          <div class="top-bar">
            <span class="brand">GE Profile</span>
            <span class="name" data-field="name"></span>
          </div>

          <div class="lcd-bezel">
            <div class="lcd-screen" data-field="lcdScreen">
              <div class="lcd-row main">
                <span class="lcd-cycle" data-field="lcdCycle"></span>
                <span class="lcd-time" data-field="lcdTime"></span>
              </div>
              <div class="lcd-row">
                <span class="lcd-sub" data-field="lcdSub"></span>
                <span class="lcd-state" data-field="lcdState"></span>
              </div>
            </div>
          </div>

          <div class="vent-warning" data-field="ventWarning">
            <span class="vent-warning-icon">\u26a0\ufe0f</span> Blocked Vent Detected
          </div>

          <div class="machine-body">
            <div class="drum-container">
              <div class="door-ring"></div>
              <div class="glow-ring" data-field="glowRing"></div>
              <div class="door-glass" data-field="doorGlass">
                <div class="steam-container" data-field="steamContainer">
                  <div class="steam-wisp"></div>
                  <div class="steam-wisp"></div>
                  <div class="steam-wisp"></div>
                  <div class="steam-wisp"></div>
                  <div class="steam-wisp"></div>
                </div>
                <div class="drum-inner" data-field="drumInner">
                  <div class="perf-ring"></div>
                  <div class="lifter" data-field="lifter0"></div>
                  <div class="lifter" data-field="lifter1"></div>
                  <div class="lifter" data-field="lifter2"></div>
                  <div class="lifter" data-field="lifter3"></div>
                </div>
              </div>
              <div class="door-handle" data-field="doorHandle"></div>
            </div>

            <div class="sensor-grid">
              <div class="sensor-item">
                <span class="sensor-label">Heat</span>
                <span class="sensor-value" data-field="sensorHeat"></span>
              </div>
              <div class="sensor-item">
                <span class="sensor-label">Dryness</span>
                <span class="sensor-value" data-field="sensorDryness"></span>
              </div>
              <div class="sensor-item">
                <span class="sensor-label" data-field="sensorThirdLabel"></span>
                <span class="sensor-value" data-field="sensorThirdValue"></span>
              </div>
              <div class="sensor-item">
                <span class="sensor-label">Eco Dry</span>
                <span class="sensor-value" data-field="sensorEcoDry"></span>
              </div>
              <div class="sensor-item">
                <span class="sensor-label">Ext Tumble</span>
                <span class="sensor-value" data-field="sensorExtTumble"></span>
              </div>
              <div class="sensor-item">
                <span class="sensor-label" data-field="sensorSixthLabel"></span>
                <span class="sensor-value" data-field="sensorSixthValue"></span>
              </div>
            </div>
          </div>

          <div class="footer">
            <span class="entity-id" data-field="footerEntity"></span>
            <span class="entity-id">v${GE_DRYER_CARD_VERSION}</span>
          </div>
        </div>
      </ha-card>
    `;
    this._rendered = true;
  }

  // Get a data-field element
  _el(field) {
    return this.shadowRoot?.querySelector(`[data-field="${field}"]`);
  }

  // Update DOM in-place without replacing innerHTML (preserves animations)
  _update() {
    if (!this._hass || !this._config) return;

    const data = this._getDisplayData();

    // Build DOM on first render
    if (!this._rendered) {
      this._buildDom();
    }

    // Set the dynamic color as a CSS custom property on the host
    const card = this.shadowRoot.querySelector('ha-card');
    if (card) {
      card.style.setProperty('--dryer-tc-color', data.tc.color);
    }

    // Top bar
    this._el('name').textContent = this._config.name;

    // LCD screen
    const lcdScreen = this._el('lcdScreen');
    lcdScreen.className = `lcd-screen ${data.isActive ? 'active' : ''}`;

    const lcdCycle = this._el('lcdCycle');
    lcdCycle.textContent = data.lcdCycle;
    lcdCycle.className = `lcd-cycle ${data.isActive ? '' : 'off'}`;

    const lcdTime = this._el('lcdTime');
    lcdTime.textContent = data.lcdTime;
    lcdTime.style.display = data.lcdTime ? '' : 'none';

    const lcdSub = this._el('lcdSub');
    lcdSub.textContent = data.lcdSub;
    lcdSub.className = `lcd-sub ${data.isActive ? '' : 'off'}`;

    const lcdState = this._el('lcdState');
    lcdState.textContent = data.isActive ? data.tempOption : '';
    lcdState.style.display = data.isActive ? '' : 'none';

    // Vent warning
    this._el('ventWarning').className = `vent-warning ${data.ventBlocked ? 'visible' : ''}`;

    // Glow ring — dynamic color via inline style
    const glowRing = this._el('glowRing');
    if (data.isActive) {
      glowRing.className = 'glow-ring active';
      glowRing.style.borderColor = `${data.tc.color}66`;
      glowRing.style.boxShadow = `0 0 15px ${data.tc.glow}, inset 0 0 15px ${data.tc.glow}`;
    } else {
      glowRing.className = 'glow-ring';
      glowRing.style.borderColor = '';
      glowRing.style.boxShadow = '';
    }

    // Door glass — dynamic background for active state
    const doorGlass = this._el('doorGlass');
    if (data.isActive) {
      doorGlass.style.background = `radial-gradient(circle at 40% 40%, ${data.tc.color}22 0%, ${data.tc.color}11 40%, #0d0d10 100%)`;
      doorGlass.style.boxShadow = `inset 0 0 40px ${data.tc.glow}, inset 0 4px 16px rgba(0,0,0,0.4)`;
    } else {
      doorGlass.style.background = '';
      doorGlass.style.boxShadow = '';
    }

    // Drum spin animation — toggle class instead of rebuilding
    const drumInner = this._el('drumInner');
    if (data.isActive) {
      if (!drumInner.classList.contains('spinning')) drumInner.classList.add('spinning');
    } else {
      drumInner.classList.remove('spinning');
    }

    // Lifter bars — dynamic color via inline style
    for (let i = 0; i < 4; i++) {
      const lifter = this._el(`lifter${i}`);
      if (data.isActive) {
        lifter.style.background = `linear-gradient(180deg, ${data.tc.color}55 0%, ${data.tc.color}22 100%)`;
      } else {
        lifter.style.background = '';
      }
    }

    // Steam container
    this._el('steamContainer').className = `steam-container ${(data.isSteam && data.isActive) ? 'visible' : ''}`;

    // Door handle
    this._el('doorHandle').className = `door-handle ${data.doorOpen ? 'open' : ''}`;

    // Sensor grid
    const sensorHeat = this._el('sensorHeat');
    sensorHeat.textContent = data.tempOption;
    sensorHeat.className = `sensor-value ${data.isActive ? 'highlight' : ''}`;

    this._el('sensorDryness').textContent = data.drynessLevel;

    // Third sensor (sheets or washerlink)
    this._el('sensorThirdLabel').textContent = data.sheetsOrLinkLabel;
    const sensorThirdValue = this._el('sensorThirdValue');
    sensorThirdValue.textContent = data.sheetsOrLinkValue;
    if (data.sheetsOrLinkHighlight) {
      sensorThirdValue.style.color = '#4caf50';
      sensorThirdValue.className = 'sensor-value';
    } else {
      sensorThirdValue.style.color = '';
      sensorThirdValue.className = 'sensor-value';
    }

    const sensorEcoDry = this._el('sensorEcoDry');
    sensorEcoDry.textContent = data.ecoDryOn ? 'On' : 'Off';
    sensorEcoDry.className = `sensor-value ${data.ecoDryOn ? 'highlight' : ''}`;

    const sensorExtTumble = this._el('sensorExtTumble');
    sensorExtTumble.textContent = data.extTumbleOn ? 'On' : 'Off';
    sensorExtTumble.className = `sensor-value ${data.extTumbleOn ? 'highlight' : ''}`;

    // Sixth sensor (steam or tumble)
    this._el('sensorSixthLabel').textContent = data.isSteamLabel ? 'Steam' : 'Tumble';
    const sensorSixthValue = this._el('sensorSixthValue');
    const sixthOn = data.isSteamLabel ? true : data.tumbleOn;
    sensorSixthValue.textContent = sixthOn ? 'On' : 'Off';
    sensorSixthValue.className = `sensor-value ${sixthOn ? 'highlight' : ''}`;

    // Footer
    this._el('footerEntity').textContent = this._config.prefix;
  }
}

customElements.define('ge-dryer-card', GeDryerCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ge-dryer-card',
  name: 'GE Dryer Card',
  description: 'Status card for GE Profile dryers via SmartHQ',
  preview: true,
});
console.log(`GE Dryer Card v${GE_DRYER_CARD_VERSION}: registered.`);
