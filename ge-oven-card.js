const GE_OVEN_CARD_VERSION = '2.8.0';
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
    const isConvection = mode.includes('convection') || mode.includes('conv.');
    const isBroil = mode.includes('broil');
    const isRoast = mode.includes('roast');
    const isBake = (mode.includes('bake') || mode.includes('multi-bake')) && !isRoast && !isBroil;

    let topElement, bottomElement;
    if (isBroil) {
      topElement = true;
      bottomElement = false;
    } else if (isBake) {
      topElement = false;
      bottomElement = true;
    } else if (isRoast) {
      topElement = true;
      bottomElement = true;
    } else {
      topElement = true;
      bottomElement = true;
    }

    if (isConvection && isBake) {
      topElement = false;
      bottomElement = true;
    }

    return { isConvection, isBroil, isRoast, isBake, topElement, bottomElement };
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

        .window-spacer { flex: 1; position: relative; }

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
          position: absolute; bottom: 0; left: 0; right: 0; height: 90%;
          pointer-events: none; z-index: 1; display: none;
        }
        .heat-waves-rising.visible { display: block; }
        .wave-rise {
          position: absolute; bottom: 0; font-size: 20px;
          color: rgba(255, 150, 60, 0.9);
          text-shadow: 0 0 10px rgba(255, 120, 30, 0.7);
          animation: riseWave 5s ease-out infinite;
        }
        @keyframes riseWave {
          0% { transform: translateY(0); opacity: 0; }
          5% { opacity: 0.9; }
          40% { opacity: 0.6; }
          100% { transform: translateY(-150px); opacity: 0; }
        }
        .wave-rise.r1 { left: 15%; animation-delay: 0s; }
        .wave-rise.r2 { left: 35%; animation-delay: 1s; }
        .wave-rise.r3 { left: 55%; animation-delay: 2s; }
        .wave-rise.r4 { left: 75%; animation-delay: 0.5s; }
        .wave-rise.r5 { left: 45%; animation-delay: 3s; }

        /* === FALLING HEAT WAVES === */
        .heat-waves-falling {
          position: absolute; top: 0; left: 0; right: 0; height: 90%;
          pointer-events: none; z-index: 1; display: none;
        }
        .heat-waves-falling.visible { display: block; }
        .wave-fall {
          position: absolute; top: 0; font-size: 20px;
          color: rgba(255, 150, 60, 0.9);
          text-shadow: 0 0 10px rgba(255, 120, 30, 0.7);
          animation: fallWave 5s ease-out infinite;
        }
        @keyframes fallWave {
          0% { transform: translateY(0); opacity: 0; }
          5% { opacity: 0.9; }
          40% { opacity: 0.6; }
          100% { transform: translateY(150px); opacity: 0; }
        }
        .wave-fall.f1 { left: 20%; animation-delay: 0.4s; }
        .wave-fall.f2 { left: 40%; animation-delay: 1.4s; }
        .wave-fall.f3 { left: 60%; animation-delay: 0s; }
        .wave-fall.f4 { left: 80%; animation-delay: 2.4s; }
        .wave-fall.f5 { left: 50%; animation-delay: 0.8s; }

        /* === CONVECTION CIRCULATING WAVES — smooth ovals === */
        .heat-waves-convection {
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          pointer-events: none; z-index: 1; display: none;
        }
        .heat-waves-convection.visible { display: block; }
        .conv-wave {
          position: absolute; font-size: 18px;
          color: rgba(255, 150, 60, 0.9);
          text-shadow: 0 0 10px rgba(255, 120, 30, 0.7);
        }
        /* 3 on oval A, 3 on oval B — start invisible, fade in/out during orbit */
        .conv-wave.w1 { animation: ovalA 6s linear infinite; }
        .conv-wave.w2 { animation: ovalA 6s linear infinite 2s; }
        .conv-wave.w3 { animation: ovalA 6s linear infinite 4s; }
        .conv-wave.w4 { animation: ovalB 7s linear infinite 0.5s; }
        .conv-wave.w5 { animation: ovalB 7s linear infinite 2.83s; }
        .conv-wave.w6 { animation: ovalB 7s linear infinite 5.17s; }

        @keyframes ovalA {
          0%   { top: 50%; left: 10%; opacity: 0; }
          8%   { opacity: 0.8; }
          25%  { top: 20%; left: 50%; opacity: 0.7; }
          42%  { opacity: 0.8; }
          50%  { top: 50%; left: 90%; opacity: 0; }
          58%  { opacity: 0.8; }
          75%  { top: 80%; left: 50%; opacity: 0.7; }
          92%  { opacity: 0.8; }
          100% { top: 50%; left: 10%; opacity: 0; }
        }
        @keyframes ovalB {
          0%   { top: 15%; left: 50%; opacity: 0; }
          8%   { opacity: 0.75; }
          25%  { top: 50%; left: 15%; opacity: 0.65; }
          42%  { opacity: 0.75; }
          50%  { top: 85%; left: 50%; opacity: 0; }
          58%  { opacity: 0.75; }
          75%  { top: 50%; left: 85%; opacity: 0.65; }
          92%  { opacity: 0.75; }
          100% { top: 15%; left: 50%; opacity: 0; }
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
                  <div class="fan-ring"></div>
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

    // Fan visibility
    this._el('convFan').className = `conv-fan ${data.showConvFan ? 'visible' : ''}`;

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
