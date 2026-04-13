const GE_OVEN_CARD_VERSION = '1.3.1';
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
    const isActive = state.toLowerCase() !== 'off' && state.toLowerCase() !== 'unavailable';
    const opMode = attrs.operation_mode || 'Off';
    const currentTemp = attrs.current_temperature;
    const targetTemp = attrs.temperature;
    const displayTemp = attrs.display_temperature;
    const rawTemp = attrs.raw_temperature;
    const probePresent = attrs.probe_present || false;
    const displayState = attrs.display_state || state;
    const minTemp = attrs.min_temp;
    const maxTemp = attrs.max_temp;
    const opList = attrs.operation_list || [];
    const friendlyName = this._config.name || attrs.friendly_name || 'GE Oven';

    // Size configuration — window heights
    const size = this._config.size;
    const windowHeight = { normal: 180, medium: 120, small: 60 }[size];
    const windowPadding = { normal: 16, medium: 10, small: 6 }[size];

    // Format display temperature for the LCD
    const lcdTemp = isActive && displayTemp ? `${displayTemp}` : (currentTemp != null ? `${currentTemp}` : '--');
    const lcdTarget = isActive && targetTemp ? `${targetTemp}°` : '';

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

        /* === TOP BAR (brand + name) === */
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

        /* === LCD DISPLAY === */
        .lcd-bezel {
          background: #050508;
          border: 2px solid #333;
          border-radius: 8px;
          padding: 3px;
          margin-bottom: 10px;
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

        /* === HANDLE (above window) === */
        .handle-bar {
          width: 60%;
          height: 6px;
          background: linear-gradient(180deg, #555 0%, #333 50%, #444 100%);
          border-radius: 3px;
          margin: 0 auto 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.4);
        }

        /* === OVEN WINDOW === */
        .oven-window {
          background: linear-gradient(180deg, #111 0%, #1a1a1a 50%, #111 100%);
          border: 3px solid #333;
          border-radius: 12px;
          margin: 0 8px 10px;
          padding: ${windowPadding}px;
          position: relative;
          min-height: ${windowHeight}px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow: inset 0 4px 16px rgba(0,0,0,0.6);
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

        /* Element glow bars inside window when active */
        .heat-element {
          display: none;
          height: 3px;
          background: linear-gradient(90deg, transparent 0%, #ff4400 20%, #ff6600 50%, #ff4400 80%, transparent 100%);
          border-radius: 2px;
          opacity: 0.6;
        }
        .oven-window.active .heat-element {
          display: block;
          animation: elementPulse 2s ease-in-out infinite;
        }
        @keyframes elementPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        .heat-element.top { animation-delay: 0s; }
        .heat-element.bottom { animation-delay: 1s; }

        /* Window status (only shown when active) */
        .window-status {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 600;
          color: #ff8833;
          text-shadow: 0 0 12px rgba(255, 136, 51, 0.5);
          text-transform: uppercase;
          letter-spacing: 3px;
        }

        /* === ATTRIBUTE PANEL (compact) === */
        .attr-panel {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 4px;
          padding: 0 4px;
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
          margin-top: 6px;
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
            <span class="oven-name">${friendlyName}</span>
          </div>

          <!-- LCD Display -->
          <div class="lcd-bezel">
            <div class="lcd-screen ${isActive ? 'active' : ''}">
              <div class="lcd-row main">
                <div>
                  <span class="lcd-temp ${isActive ? '' : 'off'}">${lcdTemp}</span>
                  <span class="lcd-degree ${isActive ? '' : 'off'}">°F</span>
                </div>
                ${lcdTarget ? `<span class="lcd-target">SET ${lcdTarget}</span>` : ''}
              </div>
              <div class="lcd-row">
                <span class="lcd-mode ${isActive ? '' : 'off'}">${isActive ? opMode : displayState}</span>
                ${probePresent ? '<span class="lcd-status">PROBE</span>' : ''}
              </div>
            </div>
          </div>

          <!-- Handle (above window) -->
          <div class="handle-bar"></div>

          <!-- Oven Window -->
          <div class="oven-window ${isActive ? 'active' : ''}">
            <div class="heat-element top"></div>
            ${isActive ? `<div class="window-status">${opMode}</div>` : '<div style="flex:1"></div>'}
            <div class="heat-element bottom"></div>
          </div>

          <!-- Attributes Grid (compact) -->
          <div class="attr-panel">
            <div class="attr-item">
              <span class="attr-label">Current</span>
              <span class="attr-value ${isActive ? 'highlight' : ''}">${currentTemp != null ? currentTemp + '°F' : '--'}</span>
            </div>
            <div class="attr-item">
              <span class="attr-label">Target</span>
              <span class="attr-value ${isActive ? 'highlight' : ''}">${targetTemp != null ? targetTemp + '°F' : '--'}</span>
            </div>
            <div class="attr-item">
              <span class="attr-label">Display</span>
              <span class="attr-value">${displayTemp != null ? displayTemp + '°F' : '--'}</span>
            </div>
            <div class="attr-item">
              <span class="attr-label">Raw</span>
              <span class="attr-value">${rawTemp != null ? rawTemp + '°F' : '--'}</span>
            </div>
            <div class="attr-item">
              <span class="attr-label">Range</span>
              <span class="attr-value">${minTemp}°–${maxTemp}°</span>
            </div>
            <div class="attr-item">
              <span class="attr-label">Probe</span>
              <span class="attr-value">
                <span class="probe-badge ${probePresent ? 'active' : 'inactive'}">
                  ${probePresent ? '● Yes' : '○ No'}
                </span>
              </span>
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
