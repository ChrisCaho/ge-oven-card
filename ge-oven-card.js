const GE_OVEN_CARD_VERSION = '2.5.0';
console.log(`GE Oven Card v${GE_OVEN_CARD_VERSION}: loading...`);

class GeOvenCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = null;
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
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
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

  // Derive sensor prefix from water_heater entity ID
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

  // Format elapsed time from seconds
  _formatElapsed(seconds) {
    const s = parseFloat(seconds);
    if (!s || s <= 0) return null;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  // Calculate wall clock start time from H:MM delay remaining
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

  // Determine cooking mode characteristics from display_state/operation_mode
  _getModeInfo(displayState, opMode) {
    const mode = (displayState || opMode || '').toLowerCase();
    const isConvection = mode.includes('convection') || mode.includes('conv.');
    const isBroil = mode.includes('broil');
    const isRoast = mode.includes('roast');
    const isBake = (mode.includes('bake') || mode.includes('multi-bake')) && !isRoast && !isBroil;

    // Element logic
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
      // Default: both elements
      topElement = true;
      bottomElement = true;
    }

    // Convection bake: bottom element only + fan
    if (isConvection && isBake) {
      topElement = false;
      bottomElement = true;
    }

    return { isConvection, isBroil, isRoast, isBake, topElement, bottomElement };
  }

  _render() {
    if (!this._hass || !this._config) return;

    const entityId = this._config.entity;
    const stateObj = this._hass.states[entityId];

    if (!stateObj) {
      this.shadowRoot.innerHTML = `
        <ha-card>
          <div style="padding: 16px; color: #ef5350;">
            Entity not found: ${entityId}
          </div>
        </ha-card>`;
      return;
    }

    const attrs = stateObj.attributes;
    const state = stateObj.state;
    const isOff = state.toLowerCase() === 'off' || state.toLowerCase() === 'unavailable';
    const opMode = attrs.operation_mode || 'Off';
    const currentTemp = attrs.current_temperature;
    const targetTemp = attrs.temperature;
    const displayTemp = attrs.display_temperature;
    const probePresent = attrs.probe_present || false;
    const displayState = attrs.display_state || state;
    const minTemp = attrs.min_temp;
    const maxTemp = attrs.max_temp;
    const friendlyName = this._config.name || attrs.friendly_name || 'GE Oven';

    // Resolve cook mode: prefer display_state over operation_mode (SmartHQ returns "Unknown" for some modes)
    const resolvedMode = (opMode === 'Unknown' || !opMode || opMode === 'Off') ? displayState : opMode;

    // Delayed start detection
    const delayTimeAttr = attrs.delay_time_remaining;
    const isDelay = displayState.toLowerCase().includes('delay');
    const delayStartTime = this._delayStartTime(delayTimeAttr);

    // Cook mode sensor
    const cookMode = this._getSensor('cook_mode');

    // Active = not off AND not just sitting in delay
    const isActive = !isOff && !isDelay;
    const isEngaged = !isOff;

    // Mode-specific element/animation info
    const modeInfo = this._getModeInfo(displayState, opMode);

    // Oven light (select entity)
    const lightEntityId = this._config.entity.replace('water_heater.', 'select.') + '_light';
    const lightObj = this._hass.states[lightEntityId];
    const lightOn = lightObj && lightObj.state.toLowerCase() !== 'off';

    // Sensor-based values
    const cookTimeRaw = this._getSensor('cook_time_remaining');
    const kitchenTimerRaw = this._getSensor('kitchen_timer');
    const probeTemp = this._getSensor('probe_display_temp');
    const cookTimeElapsedRaw = this._getSensor('cook_time_elapsed');

    const cookTime = this._formatTime(cookTimeRaw);
    const kitchenTimer = this._formatTime(kitchenTimerRaw);
    const probeTempVal = probeTemp ? parseFloat(probeTemp) : 0;
    const elapsed = this._formatElapsed(cookTimeElapsedRaw);

    // Size configuration
    const size = this._config.size;
    const windowHeight = { normal: 180, medium: 120, small: 60 }[size];
    const windowPadding = { normal: 16, medium: 10, small: 6 }[size];

    // Treat 100°F as sensor floor
    const isBogus = (v) => v == null || v === 0 || v === 100 || v === '100';
    const realCurrentTemp = isBogus(currentTemp) ? null : currentTemp;
    const realDisplayTemp = isBogus(displayTemp) ? null : displayTemp;

    // Format display temperature for the LCD
    const lcdTemp = isActive && realDisplayTemp ? `${realDisplayTemp}` : (realCurrentTemp != null ? `${realCurrentTemp}` : '--');
    const lcdTarget = isActive && targetTemp ? `${targetTemp}°` : '';

    // Format attribute values
    const fmtTemp = (v) => (v != null && !isBogus(v)) ? `${v}°F` : '--';
    const fmtTarget = targetTemp != null ? `${targetTemp}°F` : '--';

    // LCD right-side info
    let lcdRight = '';
    if (isDelay && targetTemp) {
      lcdRight = `<span class="lcd-target">SET ${targetTemp}°</span>`;
    } else if (cookTime) {
      lcdRight = `<span class="lcd-target">COOK ${cookTime}</span>`;
    } else if (kitchenTimer) {
      lcdRight = `<span class="lcd-target">TIMER ${kitchenTimer}</span>`;
    } else if (lcdTarget) {
      lcdRight = `<span class="lcd-target">SET ${lcdTarget}</span>`;
    }

    // LCD status line right side: probe temp or PROBE label
    let lcdStatusRight = '';
    if (probePresent && probeTempVal > 0) {
      lcdStatusRight = `<span class="lcd-status">PROBE ${probeTempVal}°F</span>`;
    } else if (probePresent) {
      lcdStatusRight = '<span class="lcd-status">PROBE</span>';
    }

    // Probe display in attribute grid
    let probeDisplay = '';
    if (probePresent && probeTempVal > 0) {
      probeDisplay = `<span class="probe-badge active">${probeTempVal}°F</span>`;
    } else if (probePresent) {
      probeDisplay = '<span class="probe-badge active">● In</span>';
    } else {
      probeDisplay = '<span class="probe-badge inactive">○ No</span>';
    }

    // LCD mode line — use resolvedMode instead of opMode to fix "Unknown" bug
    const lcdModeText = isDelay
      ? (delayStartTime ? `Start At ${delayStartTime}` : displayState)
      : (isActive ? resolvedMode : displayState);

    // Window content — mode-specific elements and animations
    const showTopElement = isActive && modeInfo.topElement;
    const showBottomElement = isActive && modeInfo.bottomElement;
    const showConvFan = isActive && modeInfo.isConvection;

    // Heat wave HTML for window
    let heatWavesHtml = '';
    if (isActive) {
      if (modeInfo.isConvection) {
        // Circulating heat waves — orbit around the window center
        heatWavesHtml = `
          <div class="heat-waves-convection">
            <div class="conv-wave w1">〰</div>
            <div class="conv-wave w2">〰</div>
            <div class="conv-wave w3">〰</div>
            <div class="conv-wave w4">〰</div>
            <div class="conv-wave w5">〰</div>
            <div class="conv-wave w6">〰</div>
          </div>`;
      } else {
        // Directional heat waves from elements
        if (modeInfo.bottomElement) {
          heatWavesHtml += `
            <div class="heat-waves-rising">
              <div class="wave-rise r1">~</div>
              <div class="wave-rise r2">~</div>
              <div class="wave-rise r3">~</div>
              <div class="wave-rise r4">~</div>
              <div class="wave-rise r5">~</div>
            </div>`;
        }
        if (modeInfo.topElement) {
          heatWavesHtml += `
            <div class="heat-waves-falling">
              <div class="wave-fall f1">~</div>
              <div class="wave-fall f2">~</div>
              <div class="wave-fall f3">~</div>
              <div class="wave-fall f4">~</div>
              <div class="wave-fall f5">~</div>
            </div>`;
        }
      }
    }

    // Convection fan HTML
    const convFanHtml = showConvFan ? `
      <div class="conv-fan">
        <div class="fan-blade b1"></div>
        <div class="fan-blade b2"></div>
        <div class="fan-blade b3"></div>
        <div class="fan-blade b4"></div>
        <div class="fan-hub"></div>
      </div>` : '';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        ha-card {
          background: linear-gradient(175deg, #1a1a1e 0%, #0d0d10 100%);
          border: 1px solid #2a2a30;
          border-radius: 16px;
          overflow: hidden;
          font-family: 'Segoe UI', Roboto, sans-serif;
          color: #e0e0e0;
          padding: 0;
        }

        /* === OVEN BODY === */
        .oven-body {
          padding: 16px 16px 10px;
        }

        /* === TOP BAR === */
        .top-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .brand {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #888;
        }
        .oven-name {
          font-size: 13px;
          font-weight: 500;
          color: #aaa;
        }
        .temp-range {
          font-size: 10px;
          color: #888;
          letter-spacing: 0.5px;
        }
        .oven-light {
          position: absolute;
          top: 8px;
          right: 12px;
          font-size: 18px;
          color: #ffcc33;
          text-shadow: 0 0 10px rgba(255, 200, 50, 0.7), 0 0 20px rgba(255, 180, 30, 0.4);
          z-index: 2;
        }

        /* === LCD DISPLAY === */
        .lcd-bezel {
          background: #050508;
          border: 2px solid #333;
          border-radius: 8px;
          padding: 3px;
          margin-bottom: 16px;
          box-shadow: inset 0 2px 8px rgba(0,0,0,0.8);
        }
        .lcd-screen {
          background: linear-gradient(180deg, #080a1a 0%, #0d1025 50%, #080a1a 100%);
          border-radius: 5px;
          padding: 14px 16px;
          position: relative;
          overflow: hidden;
          min-height: 80px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .lcd-screen.active {
          background: linear-gradient(180deg, #080a1a 0%, #101830 50%, #080a1a 100%);
        }
        /* CRT scanline effect */
        .lcd-screen::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0,0,0,0.15) 2px,
            rgba(0,0,0,0.15) 4px
          );
          pointer-events: none;
          z-index: 1;
        }
        .lcd-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          position: relative;
          z-index: 2;
        }
        .lcd-row.main {
          margin-bottom: 4px;
        }
        .lcd-temp {
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 48px;
          font-weight: 700;
          color: #66bbff;
          text-shadow: 0 0 12px rgba(102, 187, 255, 0.6);
          line-height: 1;
          letter-spacing: 2px;
        }
        .lcd-temp.off {
          color: #5599cc;
          text-shadow: 0 0 8px rgba(85, 153, 204, 0.4);
        }
        .lcd-degree {
          font-size: 24px;
          color: #66bbff;
          text-shadow: 0 0 8px rgba(102, 187, 255, 0.5);
          margin-left: 2px;
          vertical-align: super;
        }
        .lcd-degree.off {
          color: #5599cc;
          text-shadow: 0 0 6px rgba(85, 153, 204, 0.4);
        }
        .lcd-target {
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 22px;
          color: #55aaee;
          text-shadow: 0 0 8px rgba(85, 170, 238, 0.4);
          opacity: 0.9;
        }
        .lcd-mode {
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 14px;
          color: #5599dd;
          text-shadow: 0 0 6px rgba(85, 153, 221, 0.4);
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .lcd-mode.off {
          color: #6699cc;
          text-shadow: 0 0 6px rgba(102, 153, 204, 0.4);
        }
        .lcd-status {
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 12px;
          color: #55aaee;
          text-shadow: 0 0 4px rgba(85, 170, 238, 0.4);
        }

        /* === DOOR FRAME === */
        .door-frame {
          border: 2px solid #3a3a40;
          border-radius: 14px;
          padding: 10px 8px 8px;
          margin-bottom: 8px;
          background: linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.1) 100%);
        }

        /* === HANDLE === */
        .handle-bar {
          width: 55%;
          height: 6px;
          background: linear-gradient(180deg, #666 0%, #444 40%, #555 100%);
          border-radius: 3px;
          margin: 0 auto 10px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
        }

        /* === OVEN WINDOW === */
        .oven-window {
          background: linear-gradient(180deg, #0a0a0c 0%, #141416 50%, #0a0a0c 100%);
          border: 2px solid #2a2a2e;
          border-radius: 10px;
          padding: ${windowPadding}px;
          min-height: ${windowHeight}px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow: inset 0 4px 16px rgba(0,0,0,0.6);
          position: relative;
          overflow: hidden;
        }
        .oven-window.active {
          background: linear-gradient(180deg, #1a0800 0%, #2d1000 30%, #3a1500 50%, #2d1000 70%, #1a0800 100%);
          border-color: #553300;
          box-shadow: inset 0 0 30px rgba(255, 100, 0, 0.15), inset 0 4px 16px rgba(0,0,0,0.4);
        }

        /* Heating glow animation */
        @keyframes heatGlow {
          0%, 100% { box-shadow: inset 0 0 30px rgba(255, 80, 0, 0.1), inset 0 4px 16px rgba(0,0,0,0.4); }
          50% { box-shadow: inset 0 0 40px rgba(255, 80, 0, 0.25), inset 0 4px 16px rgba(0,0,0,0.4); }
        }
        .oven-window.active {
          animation: heatGlow 3s ease-in-out infinite;
        }

        /* === HEAT ELEMENTS === */
        .heat-element {
          height: 3px;
          background: linear-gradient(90deg, transparent 0%, #ff4400 20%, #ff6600 50%, #ff4400 80%, transparent 100%);
          border-radius: 2px;
          opacity: 0;
          z-index: 2;
          position: relative;
        }
        .heat-element.on {
          opacity: 0.6;
          animation: elementPulse 2s ease-in-out infinite;
        }
        @keyframes elementPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        .heat-element.top.on { animation-delay: 0s; }
        .heat-element.bottom.on { animation-delay: 1s; }

        /* Element off state — still takes space but invisible */
        .heat-element.off {
          opacity: 0;
        }

        /* === WINDOW SPACER (replaces removed text) === */
        .window-spacer {
          flex: 1;
          position: relative;
        }

        /* === CONVECTION FAN === */
        .conv-fan {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 50px;
          height: 50px;
          z-index: 3;
          animation: fanSpin 2s linear infinite;
        }
        @keyframes fanSpin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .fan-blade {
          position: absolute;
          width: 20px;
          height: 6px;
          background: rgba(200, 160, 120, 0.35);
          border-radius: 3px;
          top: 50%;
          left: 50%;
        }
        .fan-blade.b1 {
          transform: translate(-100%, -50%);
        }
        .fan-blade.b2 {
          transform: translate(0%, -50%);
        }
        .fan-blade.b3 {
          transform: translate(-50%, -100%) rotate(90deg);
        }
        .fan-blade.b4 {
          transform: translate(-50%, 0%) rotate(90deg);
        }
        .fan-hub {
          position: absolute;
          width: 8px;
          height: 8px;
          background: rgba(180, 140, 100, 0.5);
          border-radius: 50%;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }

        /* === RISING HEAT WAVES (from bottom element) === */
        .heat-waves-rising {
          position: absolute;
          bottom: 16px;
          left: 0;
          right: 0;
          height: 70%;
          pointer-events: none;
          z-index: 1;
        }
        .wave-rise {
          position: absolute;
          font-size: 16px;
          color: rgba(255, 120, 40, 0.4);
          text-shadow: 0 0 6px rgba(255, 100, 20, 0.3);
          animation: riseWave 3s ease-out infinite;
          opacity: 0;
        }
        @keyframes riseWave {
          0% { transform: translateY(0) scaleX(1); opacity: 0; }
          10% { opacity: 0.6; }
          80% { opacity: 0.15; }
          100% { transform: translateY(-100px) scaleX(1.3); opacity: 0; }
        }
        .wave-rise.r1 { left: 15%; animation-delay: 0s; }
        .wave-rise.r2 { left: 35%; animation-delay: 0.6s; }
        .wave-rise.r3 { left: 55%; animation-delay: 1.2s; }
        .wave-rise.r4 { left: 75%; animation-delay: 0.3s; }
        .wave-rise.r5 { left: 45%; animation-delay: 1.8s; }

        /* === FALLING HEAT WAVES (from top element) === */
        .heat-waves-falling {
          position: absolute;
          top: 16px;
          left: 0;
          right: 0;
          height: 70%;
          pointer-events: none;
          z-index: 1;
        }
        .wave-fall {
          position: absolute;
          font-size: 16px;
          color: rgba(255, 120, 40, 0.4);
          text-shadow: 0 0 6px rgba(255, 100, 20, 0.3);
          animation: fallWave 3s ease-out infinite;
          opacity: 0;
        }
        @keyframes fallWave {
          0% { transform: translateY(0) scaleX(1); opacity: 0; }
          10% { opacity: 0.6; }
          80% { opacity: 0.15; }
          100% { transform: translateY(100px) scaleX(1.3); opacity: 0; }
        }
        .wave-fall.f1 { left: 20%; animation-delay: 0.2s; }
        .wave-fall.f2 { left: 40%; animation-delay: 0.8s; }
        .wave-fall.f3 { left: 60%; animation-delay: 0s; }
        .wave-fall.f4 { left: 80%; animation-delay: 1.4s; }
        .wave-fall.f5 { left: 50%; animation-delay: 0.5s; }

        /* === CONVECTION CIRCULATING WAVES === */
        .heat-waves-convection {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          z-index: 1;
        }
        .conv-wave {
          position: absolute;
          font-size: 14px;
          color: rgba(255, 120, 40, 0.35);
          text-shadow: 0 0 6px rgba(255, 100, 20, 0.3);
          opacity: 0;
        }
        /* Each wave orbits around the center on its own elliptical path */
        .conv-wave.w1 { animation: orbitWave1 4s ease-in-out infinite; }
        .conv-wave.w2 { animation: orbitWave2 4s ease-in-out infinite 0.7s; }
        .conv-wave.w3 { animation: orbitWave3 4s ease-in-out infinite 1.4s; }
        .conv-wave.w4 { animation: orbitWave4 4s ease-in-out infinite 2.1s; }
        .conv-wave.w5 { animation: orbitWave5 4.5s ease-in-out infinite 0.3s; }
        .conv-wave.w6 { animation: orbitWave6 4.5s ease-in-out infinite 1.8s; }

        @keyframes orbitWave1 {
          0%   { top: 75%; left: 20%; opacity: 0; transform: rotate(0deg); }
          15%  { opacity: 0.5; }
          50%  { top: 20%; left: 70%; opacity: 0.4; transform: rotate(180deg); }
          85%  { opacity: 0.2; }
          100% { top: 75%; left: 20%; opacity: 0; transform: rotate(360deg); }
        }
        @keyframes orbitWave2 {
          0%   { top: 25%; left: 75%; opacity: 0; transform: rotate(0deg); }
          15%  { opacity: 0.5; }
          50%  { top: 70%; left: 25%; opacity: 0.4; transform: rotate(180deg); }
          85%  { opacity: 0.2; }
          100% { top: 25%; left: 75%; opacity: 0; transform: rotate(360deg); }
        }
        @keyframes orbitWave3 {
          0%   { top: 50%; left: 15%; opacity: 0; transform: rotate(90deg); }
          15%  { opacity: 0.5; }
          50%  { top: 30%; left: 80%; opacity: 0.4; transform: rotate(270deg); }
          85%  { opacity: 0.2; }
          100% { top: 50%; left: 15%; opacity: 0; transform: rotate(450deg); }
        }
        @keyframes orbitWave4 {
          0%   { top: 30%; left: 85%; opacity: 0; transform: rotate(270deg); }
          15%  { opacity: 0.5; }
          50%  { top: 65%; left: 15%; opacity: 0.4; transform: rotate(90deg); }
          85%  { opacity: 0.2; }
          100% { top: 30%; left: 85%; opacity: 0; transform: rotate(-90deg); }
        }
        @keyframes orbitWave5 {
          0%   { top: 80%; left: 50%; opacity: 0; transform: rotate(45deg); }
          15%  { opacity: 0.45; }
          50%  { top: 15%; left: 40%; opacity: 0.35; transform: rotate(225deg); }
          85%  { opacity: 0.15; }
          100% { top: 80%; left: 50%; opacity: 0; transform: rotate(405deg); }
        }
        @keyframes orbitWave6 {
          0%   { top: 15%; left: 45%; opacity: 0; transform: rotate(135deg); }
          15%  { opacity: 0.45; }
          50%  { top: 80%; left: 55%; opacity: 0.35; transform: rotate(315deg); }
          85%  { opacity: 0.15; }
          100% { top: 15%; left: 45%; opacity: 0; transform: rotate(495deg); }
        }

        /* === ATTRIBUTE PANEL === */
        .attr-panel {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 4px;
          margin-top: 8px;
        }
        .attr-item {
          background: rgba(255,255,255,0.04);
          border-radius: 6px;
          padding: 4px 6px;
          display: flex;
          flex-direction: column;
        }
        .attr-label {
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #999;
          margin-bottom: 1px;
        }
        .attr-value {
          font-size: 12px;
          font-weight: 500;
          color: #e0e0e0;
        }
        .attr-value.highlight {
          color: #ff9944;
        }
        .attr-value.timer {
          color: #66bbff;
        }

        /* === PROBE INDICATOR === */
        .probe-badge {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-size: 10px;
        }
        .probe-badge.active {
          color: #4caf50;
        }
        .probe-badge.inactive {
          color: #999;
        }

        /* === FOOTER === */
        .footer {
          margin-top: 4px;
          padding: 4px 4px 0;
          border-top: 1px solid rgba(255,255,255,0.06);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .entity-id {
          font-size: 9px;
          color: #444;
          font-family: monospace;
        }
      </style>

      <ha-card>
        <div class="oven-body">
          <!-- Top bar -->
          <div class="top-bar">
            <span class="brand">GE Profile</span>
            <span class="temp-range">${minTemp}°–${maxTemp}°</span>
            <span class="oven-name">${friendlyName}</span>
          </div>

          <!-- LCD Display -->
          <div class="lcd-bezel">
            <div class="lcd-screen ${isEngaged ? 'active' : ''}">
              ${lightOn ? '<span class="oven-light">💡</span>' : ''}
              <div class="lcd-row main">
                <div>
                  <span class="lcd-temp ${isEngaged ? '' : 'off'}">${isDelay ? 'DELAY' : lcdTemp}</span>
                  ${isDelay ? '' : `<span class="lcd-degree ${isEngaged ? '' : 'off'}">°F</span>`}
                </div>
                ${lcdRight}
              </div>
              <div class="lcd-row">
                <span class="lcd-mode ${isEngaged ? '' : 'off'}">${lcdModeText}</span>
                ${lcdStatusRight}
              </div>
            </div>
          </div>

          <!-- Door frame: handle + window + stats -->
          <div class="door-frame">
            <div class="handle-bar"></div>

            <!-- Oven Window -->
            <div class="oven-window ${isActive ? 'active' : ''}">
              <div class="heat-element top ${showTopElement ? 'on' : 'off'}"></div>
              <div class="window-spacer">
                ${convFanHtml}
                ${heatWavesHtml}
              </div>
              <div class="heat-element bottom ${showBottomElement ? 'on' : 'off'}"></div>
            </div>

            <!-- Attributes Grid -->
            <div class="attr-panel">
              <div class="attr-item">
                <span class="attr-label">Current</span>
                <span class="attr-value ${isEngaged ? 'highlight' : ''}">${fmtTemp(currentTemp)}</span>
              </div>
              <div class="attr-item">
                <span class="attr-label">Target</span>
                <span class="attr-value ${isEngaged ? 'highlight' : ''}">${fmtTarget}</span>
              </div>
              <div class="attr-item">
                <span class="attr-label">Probe</span>
                <span class="attr-value">${probeDisplay}</span>
              </div>
              <div class="attr-item">
                <span class="attr-label">Cook Timer</span>
                <span class="attr-value ${cookTime ? 'timer' : ''}">${cookTime || '--'}</span>
              </div>
              <div class="attr-item">
                <span class="attr-label">Kitchen Timer</span>
                <span class="attr-value ${kitchenTimer ? 'timer' : ''}">${kitchenTimer || '--'}</span>
              </div>
              <div class="attr-item">
                <span class="attr-label">Elapsed</span>
                <span class="attr-value ${elapsed ? 'timer' : ''}">${elapsed || '--'}</span>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="footer">
            <span class="entity-id">${entityId}</span>
            <span class="entity-id">v${GE_OVEN_CARD_VERSION}</span>
          </div>
        </div>
      </ha-card>
    `;
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
