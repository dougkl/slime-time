// Slime Time cards: cartoon brightness slider (custom:slime-slider-card)
//   type: custom:slime-slider-card
//   entity: light.living_room
// Meant to sit inside a Slime Time button-card tile (custom_fields), but works on its own too.
(() => {
  if (customElements.get('slime-slider-card')) return;

  const CSS = `
    :host { display: block; }
    .wrap { padding: 2px 5px 5px 0; }
    .track {
      position: relative; height: 34px; border-radius: 999px; box-sizing: border-box;
      border: 3px solid var(--slime-ink, #111); background: var(--slime-bubble-bg, #fff);
      box-shadow: 3px 3px 0 var(--slime-ink, #111); touch-action: none; cursor: pointer;
      outline: none; overflow: visible;
    }
    .track:focus-visible { box-shadow: 3px 3px 0 var(--slime-ink, #111), 0 0 0 3px var(--slime-on-icon, #8BE000); }
    .fill {
      position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px;
      background: var(--slime-fill, var(--primary-color, #8BE000)); min-width: 28px;
      transition: width .12s ease-out, opacity .2s;
    }
    .off .fill { opacity: .35; }
    .knob {
      position: absolute; top: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%;
      box-sizing: border-box; background: var(--slime-tile-text, #fff); border: 3px solid var(--slime-ink, #111);
      box-shadow: 2px 2px 0 var(--slime-ink, #111); transition: left .12s ease-out;
    }
    .dragging .fill, .dragging .knob { transition: none; }
    .dragging .knob { transform: scale(1.12); }
    .pct {
      position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none;
      font-family: "Luckiest Guy", Nunito, sans-serif; font-size: 15px; letter-spacing: .5px;
      color: var(--slime-tile-text, #111);
    }
    .pct.left { right: auto; left: 14px; color: var(--slime-ink, #111); }
    .hidden { display: none; }
    @media (prefers-reduced-motion: reduce) { .fill, .knob { transition: none; } }
  `;

  class SlimeSliderCard extends HTMLElement {
    setConfig(config) {
      if (!config || !config.entity) throw new Error('slime-slider-card: entity is required');
      this._config = config;
      this._build();
    }
    getCardSize() { return 1; }

    set hass(hass) {
      this._hass = hass;
      if (!this._dragging) this._render();
    }

    _build() {
      if (this._root) return;
      this._root = this.attachShadow({ mode: 'open' });
      this._root.innerHTML = `<style>${CSS}</style>
        <div class="wrap"><div class="track" role="slider" tabindex="0" aria-valuemin="1" aria-valuemax="100">
          <div class="fill"></div><div class="knob"></div><span class="pct"></span>
        </div></div>`;
      this._track = this._root.querySelector('.track');
      this._fill = this._root.querySelector('.fill');
      this._knob = this._root.querySelector('.knob');
      this._pct = this._root.querySelector('.pct');

      // keep taps on the slider from toggling the tile it sits in
      for (const ev of ['click', 'dblclick', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'contextmenu']) {
        this._track.addEventListener(ev, (e) => e.stopPropagation());
      }
      this._track.addEventListener('pointerdown', (e) => this._down(e));
      this._track.addEventListener('pointermove', (e) => this._move(e));
      this._track.addEventListener('pointerup', (e) => this._up(e));
      this._track.addEventListener('pointercancel', (e) => this._up(e));
      this._track.addEventListener('keydown', (e) => this._key(e));
    }

    _state() { return this._hass && this._config ? this._hass.states[this._config.entity] : undefined; }

    _dimmable(st) {
      if (!st) return false;
      const modes = st.attributes.supported_color_modes;
      if (Array.isArray(modes)) return modes.some((m) => m !== 'onoff');
      return st.attributes.brightness != null;
    }

    _current() {
      const st = this._state();
      if (!st || st.state !== 'on') return null;
      const b = st.attributes.brightness;
      return b == null ? 100 : Math.max(1, Math.round(b / 2.55));
    }

    _render(valueOverride) {
      const st = this._state();
      const wrap = this._root.querySelector('.wrap');
      if (!this._dimmable(st) || ['unavailable', 'unknown'].includes(st && st.state)) {
        wrap.classList.add('hidden'); this.style.display = 'none'; return;
      }
      wrap.classList.remove('hidden'); this.style.display = '';
      const on = st.state === 'on';
      const v = valueOverride != null ? valueOverride : (this._current() ?? this._last ?? 50);
      this._track.classList.toggle('off', !on && valueOverride == null);
      this._fill.style.width = `calc(${v}% )`;
      this._knob.style.left = `clamp(15px, ${v}%, calc(100% - 15px))`;
      const showPct = on || valueOverride != null;
      this._pct.textContent = showPct ? `${v}%` : 'OFF';
      this._pct.classList.toggle('left', showPct && v > 55);
      this._track.setAttribute('aria-valuenow', String(v));
      this._track.setAttribute('aria-valuetext', on ? `${v}%` : 'off');
      this._track.setAttribute('aria-label', `${(st.attributes.friendly_name || 'Light')} brightness`);
    }

    _valueAt(e) {
      const r = this._track.getBoundingClientRect();
      const x = Math.min(Math.max(e.clientX - r.left, 0), r.width);
      return Math.max(1, Math.round((x / r.width) * 100));
    }

    _down(e) {
      e.stopPropagation(); e.preventDefault();
      this._dragging = true;
      this._track.setPointerCapture(e.pointerId);
      this._track.classList.add('dragging');
      this._v = this._valueAt(e);
      this._render(this._v);
      this._sendSoon();
    }
    _move(e) {
      if (!this._dragging) return;
      e.stopPropagation();
      this._v = this._valueAt(e);
      this._render(this._v);
      this._sendSoon();
    }
    _up(e) {
      if (!this._dragging) return;
      e.stopPropagation();
      this._dragging = false;
      this._track.classList.remove('dragging');
      clearTimeout(this._timer); this._timer = null;
      this._send(this._v);
    }
    _key(e) {
      const step = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5, PageUp: 20, PageDown: -20 }[e.key];
      const jump = { Home: 1, End: 100 }[e.key];
      if (step == null && jump == null) return;
      e.preventDefault(); e.stopPropagation();
      const v = jump ?? Math.min(100, Math.max(1, (this._current() ?? 0) + step));
      this._render(v); this._send(v);
    }

    _sendSoon() {
      if (this._timer) return;
      this._timer = setTimeout(() => { this._timer = null; if (this._dragging) this._send(this._v); }, 250);
    }
    _send(v) {
      if (!this._hass || v == null || v === this._sent) return;
      this._sent = v; this._last = v;
      this._hass.callService('light', 'turn_on', { entity_id: this._config.entity, brightness_pct: v });
      setTimeout(() => { if (this._sent === v) this._sent = undefined; }, 1500);
    }
  }

  customElements.define('slime-slider-card', SlimeSliderCard);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: 'slime-slider-card', name: 'Slime Time brightness slider', description: 'Chunky cartoon brightness slider for a light.' });
})();
