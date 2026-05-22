/**
 * vertical-mixer-card — a Lovelace custom card for Home Assistant.
 *
 * Mixer-console style vertical sliders for any `number` or
 * `input_number` entity. Groups entities side by side like a mixing
 * desk; reads min/max/step/unit from each entity's state attributes
 * so it works with any range without per-entity configuration.
 *
 * Dashboard config (YAML):
 *
 *   type: custom:vertical-mixer-card
 *   title: Optional title shown above the mixer
 *   slider_height: 180        # optional, px (default 180)
 *   unity_value: 0            # optional, reference line value (default 0)
 *                             # set to null/false to hide
 *   show_ticks: true          # optional, draw tick marks (default true)
 *   show_endpoints: true      # optional, label min/max at track ends (default true)
 *   groups:
 *     - name: Front
 *       entities:
 *         - entity: number.front_left_level
 *           label: L
 *         - entity: number.front_right_level
 *           label: R
 *           color: orange
 *
 * Each entity in `entities[]` may be a string (entity_id) or an object
 * with `entity` plus optional `label` and `color`. Colors accept the
 * mushroom palette names (red, orange, amber, green, blue, purple…) or
 * any CSS color.
 */

const MUSHROOM_COLORS = {
  red: "#f44336", "deep-orange": "#ff5722", orange: "#ff9800",
  amber: "#ffc107", yellow: "#ffeb3b", lime: "#cddc39",
  green: "#4caf50", teal: "#009688", cyan: "#00bcd4",
  "light-blue": "#03a9f4", blue: "#2196f3", indigo: "#3f51b5",
  "deep-purple": "#673ab7", purple: "#9c27b0", pink: "#e91e63",
  brown: "#795548", grey: "#9e9e9e",
};
const COLOR_NAMES = Object.keys(MUSHROOM_COLORS);

const resolveColor = (c) => {
  if (!c) return null;
  return MUSHROOM_COLORS[c] || c;
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const niceStep = (range, count) => {
  const raw = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let nice;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * mag;
};

const fmtTick = (v) => {
  const s = (Math.abs(v) < 1e-9) ? "0" : (v > 0 ? `+${v}` : `${v}`);
  return s;
};

class VerticalMixerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._pending = {};
    this._timers = {};
    this._dragging = null;
  }

  setConfig(config) {
    if (!config.groups || !Array.isArray(config.groups) || config.groups.length === 0) {
      throw new Error("vertical-mixer-card: `groups` array is required");
    }
    for (const g of config.groups) {
      if (!g.entities || !Array.isArray(g.entities) || g.entities.length === 0) {
        throw new Error("vertical-mixer-card: each group needs an `entities` array");
      }
    }
    this._config = config;
    this._sliderHeight = config.slider_height || 180;
    this._unityValue = (config.unity_value === undefined) ? 0 : config.unity_value;
    this._showTicks = config.show_ticks !== false;
    this._showEndpoints = config.show_endpoints !== false;
    this._rendered = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) {
      this._render();
      this._rendered = true;
    }
    this._update();
  }

  _entitySpec(e) {
    if (typeof e === "string") return { entity: e };
    return e;
  }

  _render() {
    const groupsHtml = this._config.groups.map((g) => {
      const slidersHtml = g.entities.map((raw) => {
        const e = this._entitySpec(raw);
        const accent = resolveColor(e.color) || "var(--primary-color)";
        const label = e.label || e.entity.split(".").pop();
        return `
          <div class="slider-col" data-entity="${e.entity}" style="--accent: ${accent};">
            <div class="value" data-role="value">—</div>
            ${this._showEndpoints ? `<div class="endpoint endpoint-max" data-role="max">—</div>` : ""}
            <div class="track" data-role="track" style="height: ${this._sliderHeight}px;">
              <div class="track-bg"></div>
              <div class="track-cap track-cap-top"></div>
              <div class="track-cap track-cap-bot"></div>
              <div class="ticks" data-role="ticks"></div>
              <div class="track-unity" data-role="unity"></div>
              <div class="track-fill" data-role="fill"></div>
              <div class="thumb" data-role="thumb"></div>
            </div>
            ${this._showEndpoints ? `<div class="endpoint endpoint-min" data-role="min">—</div>` : ""}
            <div class="label" title="${e.entity}">${label}</div>
          </div>
        `;
      }).join("");
      const groupTitle = g.name ? `<div class="group-title">${g.name}</div>` : "";
      return `<div class="group">${groupTitle}<div class="sliders">${slidersHtml}</div></div>`;
    }).join("");

    const titleHtml = this._config.title
      ? `<div class="card-title">${this._config.title}</div>`
      : "";

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { padding: 16px; display: block; }
        .card-title {
          font-size: 1.1em; font-weight: 500;
          margin-bottom: 12px; color: var(--primary-text-color);
        }
        .groups {
          display: flex; flex-wrap: wrap; gap: 20px;
          justify-content: flex-start;
        }
        .group {
          display: flex; flex-direction: column;
          padding: 12px 14px;
          background: var(--card-background-color, var(--ha-card-background));
          border-radius: var(--ha-card-border-radius, 12px);
          border: 1px solid var(--divider-color, rgba(0,0,0,0.12));
        }
        .group-title {
          font-size: 0.85em; font-weight: 500;
          margin-bottom: 10px;
          color: var(--secondary-text-color);
          text-align: center;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .sliders { display: flex; gap: 18px; align-items: stretch; }
        .slider-col {
          display: flex; flex-direction: column; align-items: center;
          min-width: 44px;
        }
        .slider-col.unavailable { opacity: 0.4; pointer-events: none; }
        .value {
          font-size: 0.78em; font-variant-numeric: tabular-nums;
          font-weight: 500; color: var(--accent);
          margin-bottom: 6px; min-height: 1.1em;
          text-align: center; white-space: nowrap;
        }
        .endpoint {
          font-size: 0.62em; line-height: 1;
          color: var(--secondary-text-color);
          opacity: 0.55;
          font-variant-numeric: tabular-nums;
        }
        .endpoint-max { margin-bottom: 3px; }
        .endpoint-min { margin-top: 3px; }
        .track {
          position: relative; width: 36px;
          cursor: pointer; touch-action: none; user-select: none;
        }
        .track-bg {
          position: absolute; left: 50%; top: 6px; bottom: 6px;
          width: 4px; transform: translateX(-50%);
          background: var(--divider-color, rgba(127,127,127,0.35));
          border-radius: 2px;
        }
        .ticks {
          position: absolute; left: 0; right: 0;
          top: 6px; bottom: 6px; pointer-events: none;
        }
        .tick {
          position: absolute;
          background: var(--secondary-text-color, #888);
          transform: translateY(-50%);
          border-radius: 1px;
        }
        .tick.minor {
          left: calc(50% + 4px);
          width: 4px; height: 1px;
          opacity: 0.30;
        }
        .tick.major {
          left: calc(50% + 4px);
          width: 12px; height: 2px;
          opacity: 0.55;
        }
        .tick-mirror {
          position: absolute;
          right: calc(50% + 4px);
          background: var(--secondary-text-color, #888);
          transform: translateY(-50%);
          border-radius: 1px;
        }
        .tick-mirror.minor {
          width: 4px; height: 1px;
          opacity: 0.30;
        }
        .tick-mirror.major {
          width: 12px; height: 2px;
          opacity: 0.55;
        }
        .track-fill {
          position: absolute; left: 50%; width: 4px;
          transform: translateX(-50%);
          background: var(--accent);
          border-radius: 2px;
          transition: top 0.08s ease-out, bottom 0.08s ease-out;
        }
        .track-unity {
          position: absolute; left: -3px; right: -3px;
          height: 2px; pointer-events: none;
          background: var(--secondary-text-color, #888);
          border-radius: 1px;
          opacity: 0.85;
          transform: translateY(-1px);
        }
        .track-cap {
          position: absolute; left: -3px; right: -3px;
          height: 2px; pointer-events: none;
          background: var(--secondary-text-color, #888);
          border-radius: 1px;
          opacity: 0.85;
        }
        .track-cap-top { top: 5px; }
        .track-cap-bot { bottom: 5px; }
        .thumb {
          position: absolute; left: 50%;
          width: 22px; height: 22px;
          border-radius: 50%;
          background: var(--accent);
          border: 2px solid var(--card-background-color, var(--ha-card-background, #fff));
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          transform: translate(-50%, -50%);
          cursor: grab;
          transition: transform 0.08s ease-out, top 0.08s ease-out;
        }
        .track:active .thumb,
        .thumb.dragging {
          cursor: grabbing;
          transform: translate(-50%, -50%) scale(1.18);
        }
        .label {
          font-size: 0.72em; color: var(--secondary-text-color);
          margin-top: 6px; text-align: center;
          max-width: 60px; overflow: hidden;
          text-overflow: ellipsis; white-space: nowrap;
        }
      </style>
      <ha-card>
        ${titleHtml}
        <div class="groups">${groupsHtml}</div>
      </ha-card>
    `;

    this.shadowRoot.querySelectorAll(".slider-col").forEach((col) => {
      this._wireSlider(col);
    });
  }

  _wireSlider(col) {
    const eid = col.dataset.entity;
    const track = col.querySelector("[data-role=track]");
    const thumb = col.querySelector("[data-role=thumb]");

    const valueFromY = (clientY) => {
      const rect = track.getBoundingClientRect();
      const usable = rect.height - 12;
      const y = clamp(clientY - rect.top - 6, 0, usable);
      const pct = 1 - (y / usable);
      const state = this._hass?.states?.[eid];
      if (!state) return null;
      const min = parseFloat(state.attributes.min ?? 0);
      const max = parseFloat(state.attributes.max ?? 100);
      const step = parseFloat(state.attributes.step ?? 1);
      let v = min + pct * (max - min);
      v = Math.round(v / step) * step;
      return clamp(v, min, max);
    };

    const onDown = (ev) => {
      ev.preventDefault();
      if (col.classList.contains("unavailable")) return;
      track.setPointerCapture(ev.pointerId);
      thumb.classList.add("dragging");
      this._dragging = eid;
      const v = valueFromY(ev.clientY);
      if (v !== null) this._applyLocal(col, eid, v);
    };
    const onMove = (ev) => {
      if (this._dragging !== eid) return;
      const v = valueFromY(ev.clientY);
      if (v !== null) this._applyLocal(col, eid, v);
    };
    const onUp = (ev) => {
      if (track.hasPointerCapture(ev.pointerId)) {
        track.releasePointerCapture(ev.pointerId);
      }
      thumb.classList.remove("dragging");
      setTimeout(() => { if (this._dragging === eid) this._dragging = null; }, 400);
    };

    track.addEventListener("pointerdown", onDown);
    track.addEventListener("pointermove", onMove);
    track.addEventListener("pointerup", onUp);
    track.addEventListener("pointercancel", onUp);
  }

  _applyLocal(col, eid, value) {
    this._renderValue(col, eid, value);
    this._scheduleUpdate(eid, value);
  }

  _renderTicks(col, min, max) {
    if (!this._showTicks) return;
    const ticksEl = col.querySelector("[data-role=ticks]");
    if (ticksEl.dataset.min === String(min) && ticksEl.dataset.max === String(max)) return;
    ticksEl.dataset.min = String(min);
    ticksEl.dataset.max = String(max);
    ticksEl.innerHTML = "";
    const range = max - min;
    if (range <= 0) return;
    const major = niceStep(range, 4);
    const minor = major / 5;
    const eps = minor / 100;
    const unity = this._unityValue;
    const hasUnity = unity !== null && unity !== false && unity >= min && unity <= max;
    const start = Math.ceil(min / minor) * minor;
    for (let v = start; v <= max + eps; v = +(v + minor).toFixed(6)) {
      if (hasUnity && Math.abs(v - unity) < eps) continue;
      if (Math.abs(v - min) < eps || Math.abs(v - max) < eps) continue;
      const isMajor = Math.abs(v / major - Math.round(v / major)) < eps;
      const pct = (max - v) / range * 100;
      const tick = document.createElement("div");
      tick.className = `tick ${isMajor ? "major" : "minor"}`;
      tick.style.top = `${pct}%`;
      ticksEl.appendChild(tick);
      const mirror = document.createElement("div");
      mirror.className = `tick-mirror ${isMajor ? "major" : "minor"}`;
      mirror.style.top = `${pct}%`;
      ticksEl.appendChild(mirror);
    }
  }

  _renderValue(col, eid, value) {
    const state = this._hass?.states?.[eid];
    if (!state) return;
    const min = parseFloat(state.attributes.min ?? 0);
    const max = parseFloat(state.attributes.max ?? 100);
    const range = max - min;
    if (range <= 0) return;

    this._renderTicks(col, min, max);

    if (this._showEndpoints) {
      const maxEl = col.querySelector("[data-role=max]");
      const minEl = col.querySelector("[data-role=min]");
      if (maxEl) maxEl.textContent = fmtTick(max);
      if (minEl) minEl.textContent = fmtTick(min);
    }

    const pct = (value - min) / range;
    const topPct = (1 - pct) * 100;

    const thumb = col.querySelector("[data-role=thumb]");
    const fill = col.querySelector("[data-role=fill]");
    const unity = col.querySelector("[data-role=unity]");
    const valueEl = col.querySelector("[data-role=value]");

    thumb.style.top = `${topPct}%`;
    fill.style.top = `${topPct}%`;
    fill.style.bottom = `6px`;

    if (this._unityValue !== null && this._unityValue !== false &&
        this._unityValue >= min && this._unityValue <= max) {
      const upct = (this._unityValue - min) / range;
      unity.style.display = "block";
      unity.style.top = `${(1 - upct) * 100}%`;
    } else {
      unity.style.display = "none";
    }

    valueEl.textContent = this._formatValue(eid, value);
  }

  _update() {
    if (!this._hass) return;
    this.shadowRoot.querySelectorAll(".slider-col").forEach((col) => {
      const eid = col.dataset.entity;
      const state = this._hass.states[eid];
      if (!state || state.state === "unavailable" || state.state === "unknown") {
        col.classList.add("unavailable");
        col.querySelector("[data-role=value]").textContent = "—";
        return;
      }
      col.classList.remove("unavailable");
      if (this._dragging === eid) return;
      const val = parseFloat(state.state);
      if (!isNaN(val)) this._renderValue(col, eid, val);
    });
  }

  _formatValue(eid, val) {
    const state = this._hass?.states?.[eid];
    const step = parseFloat(state?.attributes?.step ?? 1);
    const unit = state?.attributes?.unit_of_measurement ?? "";
    const decimals = step < 1 ? 1 : 0;
    const shown = val.toFixed(decimals);
    const sign = val > 0 ? "+" : "";
    return `${sign}${shown}${unit ? " " + unit : ""}`;
  }

  _scheduleUpdate(eid, value) {
    this._pending[eid] = value;
    clearTimeout(this._timers[eid]);
    this._timers[eid] = setTimeout(() => {
      const v = this._pending[eid];
      const domain = eid.split(".")[0];
      this._hass.callService(domain, "set_value", {
        entity_id: eid,
        value: v,
      });
    }, 180);
  }

  getCardSize() {
    return 3 + Math.ceil(this._sliderHeight / 50);
  }

  static getConfigElement() {
    return document.createElement("vertical-mixer-card-editor");
  }

  static getStubConfig() {
    return {
      title: "Mixer",
      groups: [{
        name: "Group 1",
        entities: [{ entity: "", label: "", color: "" }],
      }],
    };
  }
}

customElements.define("vertical-mixer-card", VerticalMixerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "vertical-mixer-card",
  name: "Vertical Mixer Card",
  description: "Mixer-console style vertical sliders for number/input_number entities",
  preview: false,
  documentationURL: "https://github.com/Gorke07/lovelace-vertical-mixer-card",
});

/* ---------- Visual editor ---------- */

class VerticalMixerCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    this._config = JSON.parse(JSON.stringify(config || {}));
    if (!this._config.groups) this._config.groups = [];
    this._render();
  }

  set hass(hass) { this._hass = hass; }

  _fire() {
    const ev = new Event("config-changed", { bubbles: true, composed: true });
    ev.detail = { config: this._config };
    this.dispatchEvent(ev);
  }

  _render() {
    const groupsHtml = (this._config.groups || []).map((g, gi) => {
      const entitiesHtml = (g.entities || []).map((rawE, ei) => {
        const e = typeof rawE === "string" ? { entity: rawE } : rawE;
        const colorOpts = ["", ...COLOR_NAMES].map(
          (c) => `<option value="${c}" ${c === (e.color || "") ? "selected" : ""}>${c || "— color —"}</option>`
        ).join("");
        return `
          <div class="entity-row" data-gi="${gi}" data-ei="${ei}">
            <input class="ent-id"    type="text" placeholder="entity_id (number.*)" value="${e.entity || ""}" data-key="entity" />
            <input class="ent-label" type="text" placeholder="Label" value="${e.label || ""}" data-key="label" />
            <select class="ent-color" data-key="color">${colorOpts}</select>
            <button class="icon-btn" data-action="remove-entity" title="Remove">×</button>
          </div>
        `;
      }).join("");
      return `
        <div class="group-edit" data-gi="${gi}">
          <div class="group-head">
            <input class="grp-name" type="text" placeholder="Group name" value="${g.name || ""}" data-key="group-name" />
            <button class="icon-btn" data-action="move-group-up"   title="Move up">▲</button>
            <button class="icon-btn" data-action="move-group-down" title="Move down">▼</button>
            <button class="icon-btn danger" data-action="remove-group" title="Remove group">×</button>
          </div>
          <div class="entities">${entitiesHtml}</div>
          <button class="add-btn" data-action="add-entity" data-gi="${gi}">+ Add entity</button>
        </div>
      `;
    }).join("");

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .editor { display: flex; flex-direction: column; gap: 12px; padding: 4px; }
        .row { display: flex; align-items: center; gap: 10px; }
        .row label { min-width: 110px; color: var(--secondary-text-color); font-size: 0.9em; }
        input[type=text], input[type=number], select {
          flex: 1; padding: 6px 8px;
          background: var(--card-background-color, transparent);
          border: 1px solid var(--divider-color, rgba(127,127,127,0.3));
          border-radius: 6px;
          color: var(--primary-text-color);
          font: inherit;
          min-width: 0;
        }
        h4 { margin: 8px 0 4px; color: var(--primary-text-color); font-weight: 500; font-size: 0.95em; }
        .group-edit {
          border: 1px solid var(--divider-color, rgba(127,127,127,0.3));
          border-radius: 8px; padding: 10px; margin-bottom: 8px;
          background: var(--secondary-background-color, transparent);
        }
        .group-head { display: flex; gap: 6px; align-items: center; margin-bottom: 8px; }
        .grp-name { flex: 1; font-weight: 500; }
        .entities { display: flex; flex-direction: column; gap: 6px; }
        .entity-row { display: flex; gap: 6px; align-items: center; }
        .ent-id { flex: 2; }
        .ent-label { flex: 1; max-width: 90px; }
        .ent-color { flex: 1; max-width: 110px; }
        .icon-btn {
          width: 28px; height: 28px;
          border: 1px solid var(--divider-color, rgba(127,127,127,0.3));
          border-radius: 6px;
          background: transparent; color: var(--primary-text-color);
          cursor: pointer; font-size: 0.9em;
          display: flex; align-items: center; justify-content: center;
        }
        .icon-btn:hover { background: var(--secondary-background-color, rgba(127,127,127,0.1)); }
        .icon-btn.danger:hover { color: var(--error-color, #e53935); }
        .add-btn {
          margin-top: 8px; padding: 6px 12px;
          background: transparent;
          border: 1px dashed var(--divider-color, rgba(127,127,127,0.3));
          border-radius: 6px;
          color: var(--primary-text-color);
          cursor: pointer; font-size: 0.85em;
        }
        .add-btn:hover { background: var(--secondary-background-color, rgba(127,127,127,0.1)); }
        .add-group-btn {
          padding: 10px;
          background: transparent;
          border: 1px dashed var(--primary-color);
          border-radius: 8px;
          color: var(--primary-color);
          cursor: pointer; font-weight: 500;
        }
      </style>
      <div class="editor">
        <div class="row">
          <label>Title</label>
          <input type="text" data-tk="title" value="${this._config.title || ""}" />
        </div>
        <div class="row">
          <label>Slider height (px)</label>
          <input type="number" min="80" max="400" step="10" data-tk="slider_height"
                 value="${this._config.slider_height ?? 180}" />
        </div>
        <div class="row">
          <label>Unity value</label>
          <input type="number" step="0.5" data-tk="unity_value"
                 value="${this._config.unity_value ?? 0}" />
        </div>
        <h4>Groups</h4>
        <div class="groups-list">${groupsHtml}</div>
        <button class="add-group-btn" data-action="add-group">+ Add group</button>
      </div>
    `;

    this._wireEvents();
  }

  _wireEvents() {
    const root = this.shadowRoot;
    root.querySelectorAll("[data-tk]").forEach((el) => {
      el.addEventListener("input", () => {
        const key = el.dataset.tk;
        let v = el.value;
        if (el.type === "number") v = v === "" ? undefined : parseFloat(v);
        else if (v === "") v = undefined;
        if (v === undefined) delete this._config[key];
        else this._config[key] = v;
        this._fire();
      });
    });

    root.querySelectorAll(".grp-name").forEach((el) => {
      el.addEventListener("input", () => {
        const gi = parseInt(el.closest(".group-edit").dataset.gi, 10);
        this._config.groups[gi].name = el.value;
        this._fire();
      });
    });

    root.querySelectorAll(".entity-row").forEach((row) => {
      const gi = parseInt(row.dataset.gi, 10);
      const ei = parseInt(row.dataset.ei, 10);
      row.querySelectorAll("[data-key]").forEach((el) => {
        el.addEventListener("input", () => {
          const ent = this._config.groups[gi].entities[ei];
          const obj = typeof ent === "string" ? { entity: ent } : { ...ent };
          const key = el.dataset.key;
          if (el.value === "") delete obj[key];
          else obj[key] = el.value;
          this._config.groups[gi].entities[ei] = obj;
          this._fire();
        });
      });
    });

    root.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        const action = btn.dataset.action;
        const groupEl = btn.closest(".group-edit");
        const gi = groupEl ? parseInt(groupEl.dataset.gi, 10) : -1;
        const rowEl = btn.closest(".entity-row");
        const ei = rowEl ? parseInt(rowEl.dataset.ei, 10) : -1;
        if (action === "add-group") {
          this._config.groups.push({ name: "New group", entities: [{ entity: "" }] });
        } else if (action === "remove-group") {
          this._config.groups.splice(gi, 1);
        } else if (action === "move-group-up" && gi > 0) {
          const arr = this._config.groups;
          [arr[gi - 1], arr[gi]] = [arr[gi], arr[gi - 1]];
        } else if (action === "move-group-down" && gi < this._config.groups.length - 1) {
          const arr = this._config.groups;
          [arr[gi + 1], arr[gi]] = [arr[gi], arr[gi + 1]];
        } else if (action === "add-entity") {
          this._config.groups[gi].entities.push({ entity: "" });
        } else if (action === "remove-entity") {
          this._config.groups[gi].entities.splice(ei, 1);
        }
        this._render();
        this._fire();
      });
    });
  }
}

customElements.define("vertical-mixer-card-editor", VerticalMixerCardEditor);
