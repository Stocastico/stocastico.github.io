/* ============================================================
   EUROPE 2D MAP
   ============================================================
   Interactive 2D map of Europe showing location pins
   Uses Canvas2D rendering with neon aesthetic matching the 3D globe
   ============================================================ */

import { getTheme, rgba } from './theme.js';
import { hasCoords } from './utils.js';

/* Active palette — single map instance per page; refreshed at construction so
   a theme switch (which rebuilds the map via js/main.js) recolours it. Named
   THEME so the render code reads it unchanged. The static PIN_COLORS keeps its
   load-time value for back-compat; instances recompute from the live THEME. */
let THEME = getTheme();
function refreshActiveTheme() { THEME = getTheme(); }

/* Geographic extent of the 2D Europe map. Exported so the globe hides the exact
   same region's worktrip/holiday pins (js/globe.js → isEuropeanSecondaryPin),
   keeping "European secondary pins live only on the 2D map" consistent and
   guaranteeing nothing hidden from the globe falls outside the map. The bounds
   reach west to Iceland (~−22°E) and south to the Canary Islands (~28.5°N). */
export const EUROPE_BOUNDS = { minLon: -25, maxLon: 40, minLat: 27, maxLat: 71 };

export class EuropeMap2D {
  /* Colour scheme matches Globe3D — semantic pins, re-tinted per palette */
  static PIN_COLORS = {
    lived:    THEME.pins.lived,
    current:  THEME.pins.current,
    worktrip: THEME.pins.worktrip,
    holiday:  THEME.pins.holiday,
  };
  static PIN_SIZE = { lived: 1.8, current: 1.8, worktrip: 1.4, holiday: 1.4 };

  constructor(canvasEl) {
    if (!canvasEl || canvasEl.tagName !== 'CANVAS') return;
    if (typeof LOCATIONS === 'undefined') {
      console.warn('EuropeMap2D: data/locations.js not loaded — map will not render.');
      return;
    }

    /* Resolve the active palette for this instance (dark/light). */
    refreshActiveTheme();
    this.PIN_COLORS = {
      lived:    THEME.pins.lived,
      current:  THEME.pins.current,
      worktrip: THEME.pins.worktrip,
      holiday:  THEME.pins.holiday,
    };

    this.canvas = canvasEl;
    this.parent = canvasEl.parentElement;
    this.tooltip = document.getElementById('europe-tooltip');
    this.ctx = this.canvas.getContext('2d');

    this.mouse = { x: -9, y: -9 };
    this._mouseOver = false;
    this._hoveredPin = null;
    this._rect = null;
    this._rafId = null;
    this._visible = true;
    /* Track every listener + observer so destroy() can tear them all down. */
    this._listeners = [];
    this._io = null;

    /* Performance: cache tooltip refs */
    this._ttType = this.tooltip?.querySelector('.et-type') || null;
    this._ttName = this.tooltip?.querySelector('.et-name') || null;
    this._ttInfo = this.tooltip?.querySelector('.et-info') || null;

    /* Filtered pins — initially all shown */
    this.visibleTypes = new Set(['lived', 'current', 'worktrip', 'holiday']);
    this.filteredPins = [];
    this.filteredTrips = [];

    /* Europe bounding box — shared with the globe's pin filter (single source
       of truth, so the two views can't drift). */
    this.bounds = { ...EUROPE_BOUNDS };

    /* Coastline polylines (filled async from data/europe-land.json) */
    this._europeLines = [];

    this._resize();
    this._buildFilteredPins();
    this._buildFilteredTrips();
    this._bindEvents();
    this._animate();
    this._loadEuropeLand();

    /* Pause when canvas is out of viewport */
    this._io = new IntersectionObserver(([e]) => {
      this._visible = e.isIntersecting;
      if (this._visible && !this._rafId) this._animate();
    }, { threshold: 0 });
    this._io.observe(canvasEl);

    this._addListener(document, 'visibilitychange', () => {
      if (!document.hidden && !this._rafId) this._animate();
    });

    /* Store reference on canvas for external access (filtering) */
    this.canvas._europe = this;
  }

  /* ── Internals ──────────────────────────────────────────────────────── */

  _resize() {
    const lonRange = this.bounds.maxLon - this.bounds.minLon;
    const latRange = this.bounds.maxLat - this.bounds.minLat;
    const centerLat = (this.bounds.minLat + this.bounds.maxLat) / 2;
    this._cosLat = Math.cos(centerLat * Math.PI / 180);

    const containerW = this.parent.clientWidth || 800;
    const containerH = this.parent.clientHeight || 600;

    /* Fit-inside: choose the scale that makes the full map visible */
    const scaleByW = containerW / (lonRange * this._cosLat);
    const scaleByH = containerH / latRange;
    this._scale = Math.min(scaleByW, scaleByH);

    this.w = Math.round(lonRange * this._cosLat * this._scale);
    this.h = Math.round(latRange * this._scale);

    /* Center the map within the container */
    this._offsetX = Math.round((containerW - this.w) / 2);
    this._offsetY = Math.round((containerH - this.h) / 2);

    /* All the geometry above is in CSS pixels and stays that way — only the
       backing store is scaled, with _draw() applying the matching transform.
       Without this the map was the one canvas on the site rendering at 1×
       (globe 1.7, cnn-hero 1.75, mnist-lab 2.0), and its coastlines are
       hairlines, which is precisely what a half-resolution buffer ruins.
       Capped at 2: beyond that the fill cost climbs faster than anyone can
       see the difference. */
    this._cssW = containerW;
    this._cssH = containerH;
    this._dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
    this.canvas.width = Math.round(containerW * this._dpr);
    this.canvas.height = Math.round(containerH * this._dpr);

    /* Don't cache the rect here — at construction the page may still be
       reflowing (web fonts / images above the map), and a layout shift that
       fires neither scroll nor resize would leave a stale rect that offsets
       the tooltip. Read it lazily on the first mousemove of each hover. */
    this._rect = null;
  }

  _buildFilteredPins() {
    this.filteredPins = (LOCATIONS.pins || [])
      .filter(pin => hasCoords(pin) && this.visibleTypes.has(pin.type))
      .filter(pin => this._isInEurope(pin))
      .map(pin => ({
        ...pin,
        x: this._lonToX(pin.lon),
        y: this._latToY(pin.lat),
      }));
  }

  _buildFilteredTrips() {
    this.filteredTrips = [];

    for (const trip of (LOCATIONS.trips || [])) {
      const cities = Array.isArray(trip.cities) ? trip.cities : [];
      if (cities.length < 2) continue;

      for (let i = 0; i < cities.length - 1; i++) {
        const a = cities[i];
        const b = cities[i + 1];
        if (!a || !b) continue;

        /* Keep the 2D map focused on Europe-only segments. */
        if (!this._isInEurope(a) || !this._isInEurope(b)) continue;

        const x0 = this._lonToX(a.lon);
        const y0 = this._latToY(a.lat);
        const x1 = this._lonToX(b.lon);
        const y1 = this._latToY(b.lat);

        const mx = (x0 + x1) * 0.5;
        const my = (y0 + y1) * 0.5;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const lift = Math.min(44, Math.max(14, len * 0.22));

        this.filteredTrips.push({
          name: trip.name || 'Trip',
          stroke: trip.color || THEME.globe.coastBright,
          x0,
          y0,
          x1,
          y1,
          cpX: mx + nx * (lift * 0.35),
          cpY: my + ny * (lift * 0.35) - lift,
          phase: i * 7,
          cycleMs: Math.max(8000, (trip.cycleSec || 24) * 1000),
        });
      }
    }
  }

  _isInEurope(pin) {
    return pin.lat >= this.bounds.minLat && pin.lat <= this.bounds.maxLat &&
           pin.lon >= this.bounds.minLon && pin.lon <= this.bounds.maxLon;
  }

  _lonToX(lon) {
    return (lon - this.bounds.minLon) * this._cosLat * this._scale + (this._offsetX || 0);
  }

  _latToY(lat) {
    return (this.bounds.maxLat - lat) * this._scale + (this._offsetY || 0);
  }

  _xyToLonLat(x, y) {
    const lon = (x - (this._offsetX || 0)) / (this._cosLat * this._scale) + this.bounds.minLon;
    const lat = this.bounds.maxLat - (y - (this._offsetY || 0)) / this._scale;
    return { lon, lat };
  }

  _bindEvents() {
    if (typeof this.canvas.addEventListener !== 'function') return;

    this._addListener(this.canvas, 'mousemove', (e) => {
      /* Cached rect (invalidated on scroll/resize) — avoids a forced layout
         on every mousemove while the cursor is over the map. */
      if (!this._rect) this._rect = this.canvas.getBoundingClientRect();
      /* Into the CSS-pixel space the pins are projected in — NOT the bitmap,
         which is devicePixelRatio times larger. Scaling to the bitmap would
         put the cursor at 2× the pins' coordinates on a retina screen and
         nothing would ever hit. */
      const scaleX = (this._cssW || this.canvas.width) / this._rect.width;
      const scaleY = (this._cssH || this.canvas.height) / this._rect.height;
      this.mouse.x = (e.clientX - this._rect.left) * scaleX;
      this.mouse.y = (e.clientY - this._rect.top) * scaleY;
      /* Keep CSS-space coords for tooltip positioning */
      this._cssMouseX = e.clientX - this._rect.left;
      this._cssMouseY = e.clientY - this._rect.top;
      this._mouseOver = true;
      this._rayhit();
      this._ensureAnimating();
    }, false);

    this._addListener(this.canvas, 'mouseleave', () => {
      this._mouseOver = false;
      /* Invalidate the cached rect so the next hover re-reads the canvas's
         current position — guards against layout shifts between sessions. */
      this._rect = null;
      this._hideTooltip();
    }, false);

    this._addListener(window, 'resize', () => {
      this._resize();
      this._buildFilteredPins();
      this._buildFilteredTrips();
      this._rect = null;
    }, false);

    /* Scrolling moves the canvas relative to the viewport, so the cached rect
       must be invalidated (cheap — the next mousemove re-reads it once). */
    this._addListener(window, 'scroll', () => { this._rect = null; }, { passive: true });
  }

  /* Track + register a listener so destroy() can later remove it. */
  _addListener(target, type, fn, opts) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, fn, opts);
    this._listeners.push({ target, type, fn, opts });
  }

  _rayhit() {
    this._hoveredPin = null;
    const hitDist = 10;  /* px hitbox radius — generous for small dots */

    /* Check pins first (higher priority) */
    for (const pin of this.filteredPins) {
      const dx = this.mouse.x - pin.x;
      const dy = this.mouse.y - pin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < hitDist) {
        this._hoveredPin = pin;
        this._showTooltip(pin);
        return;
      }
    }

    /* Check trip arcs */
    const tripHitDist = 8;
    for (const seg of this.filteredTrips) {
      if (this._distToBezier(this.mouse.x, this.mouse.y, seg) < tripHitDist) {
        this._showTripTooltip(seg);
        return;
      }
    }

    this._hideTooltip();
  }

  /* Approximate distance from point to quadratic bezier by sampling */
  _distToBezier(px, py, seg) {
    let minD = Infinity;
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const x = u * u * seg.x0 + 2 * u * t * seg.cpX + t * t * seg.x1;
      const y = u * u * seg.y0 + 2 * u * t * seg.cpY + t * t * seg.y1;
      const d = Math.hypot(px - x, py - y);
      if (d < minD) minD = d;
    }
    return minD;
  }

  _showTripTooltip(seg) {
    if (!this.tooltip) return;

    const ttType = this._ttType || this.tooltip.querySelector('.et-type');
    const ttName = this._ttName || this.tooltip.querySelector('.et-name');
    const ttInfo = this._ttInfo || this.tooltip.querySelector('.et-info');

    if (ttType) ttType.textContent = 'Trip';
    if (ttName) ttName.textContent = seg.name;
    if (ttInfo) ttInfo.textContent = '';

    this.tooltip.classList.add('visible');
    this.tooltip.style.left = `${(this._cssMouseX || this.mouse.x) + 10}px`;
    this.tooltip.style.top = `${(this._cssMouseY || this.mouse.y) - 20}px`;
  }

  _showTooltip(pin) {
    if (!this.tooltip) return;
    
    const type = pin.type || 'unknown';
    
    /* Ensure we always find and update the elements, even if cached refs are stale */
    const ttType = this._ttType || this.tooltip.querySelector('.et-type');
    const ttName = this._ttName || this.tooltip.querySelector('.et-name');
    const ttInfo = this._ttInfo || this.tooltip.querySelector('.et-info');
    
    if (ttType) ttType.textContent = `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
    if (ttName) ttName.textContent = pin.name;
    if (ttInfo) ttInfo.textContent = '';
    
    this.tooltip.classList.add('visible');
    this.tooltip.style.left = `${(this._cssMouseX || this.mouse.x) + 10}px`;
    this.tooltip.style.top = `${(this._cssMouseY || this.mouse.y) - 20}px`;
  }

  _hideTooltip() {
    if (this.tooltip) {
      this.tooltip.classList.remove('visible');
    }
  }

  _animate() {
    if (!this._visible) {
      this._rafId = null;
      return;
    }

    this._draw();

    /* Only keep the RAF loop running when there are animated trips or
       the user is hovering.  Otherwise draw once and stop — the 2D map
       is essentially static and doesn't need continuous repaints. */
    if (this.filteredTrips.length || this._mouseOver) {
      this._rafId = requestAnimationFrame(() => this._animate());
    } else {
      this._rafId = null;
    }
  }

  /* Restart the render loop when interaction resumes */
  _ensureAnimating() {
    if (!this._rafId && this._visible) this._animate();
  }

  _draw() {
    const ctx = this.ctx;
    const t = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();

    /* Everything below draws in CSS pixels; this is the only place the device
       pixel ratio is applied. setTransform (not scale) so repeated frames
       don't compound it. */
    ctx.setTransform(this._dpr || 1, 0, 0, this._dpr || 1, 0, 0);

    /* Clear */
    ctx.fillStyle = THEME.mapBg;
    ctx.fillRect(0, 0, this._cssW || this.canvas.width, this._cssH || this.canvas.height);

    /* Draw continental Europe with neon glow */
    this._drawEuropeBorders();

    /* Draw trips below pins so dots stay readable */
    this._drawTrips(t);

    /* Draw location pins */
    this.filteredPins.forEach(pin => {
      this._drawPin(pin, pin === this._hoveredPin);
    });

    /* Draw map border */
    ctx.strokeStyle = rgba(THEME.accent2, 0.3);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this._offsetX || 0, this._offsetY || 0, this.w, this.h);
  }

  _drawTrips(t) {
    const ctx = this.ctx;
    if (!this.filteredTrips.length) return;

    for (const seg of this.filteredTrips) {
      const progress = (t % seg.cycleMs) / seg.cycleMs;
      const dashOffset = -((progress * 120) + seg.phase);

      /* Soft outer glow */
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(seg.x0, seg.y0);
      ctx.quadraticCurveTo(seg.cpX, seg.cpY, seg.x1, seg.y1);
      ctx.strokeStyle = this._colorToRgba(seg.stroke, 0.18);
      ctx.lineWidth = 4;
      ctx.shadowColor = seg.stroke;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.restore();

      /* Mid stroke */
      ctx.beginPath();
      ctx.moveTo(seg.x0, seg.y0);
      ctx.quadraticCurveTo(seg.cpX, seg.cpY, seg.x1, seg.y1);
      ctx.strokeStyle = this._colorToRgba(seg.stroke, 0.5);
      ctx.lineWidth = 1.8;
      ctx.stroke();

      /* Bright moving core */
      ctx.beginPath();
      ctx.setLineDash([8, 10]);
      ctx.lineDashOffset = dashOffset;
      ctx.moveTo(seg.x0, seg.y0);
      ctx.quadraticCurveTo(seg.cpX, seg.cpY, seg.x1, seg.y1);
      ctx.strokeStyle = rgba(THEME.globe.coastBright, 0.95);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
  }

  _colorToRgba(color, alpha) {
    if (typeof color !== 'string') return rgba(THEME.globe.coastBright, alpha);

    const hex = color.trim().replace('#', '');
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    }

    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    }

    return color;
  }

  /* ── Coastline loader ──────────────────────────────────────────────────
     Loads data/europe-land.json: the polylines this map strokes, and nothing
     else. It used to fetch data/land-50m.json — 545 KB of world coastline —
     decode all 1,419 rings, and discard everything outside the Europe box, on
     a page that already downloads Three.js. Every step of that was decidable
     at build time, so scripts/generate-europe-land.mjs does it now: same
     filter, same subpath split, plus a sub-pixel simplify. 545 KB → 95 KB,
     with the drawn result unchanged.                                        */
  async _loadEuropeLand() {
    try {
      /* Root-relative for the same reason as getTopoJSON() in js/utils.js:
         page-relative breaks the moment the map is embedded below the root. */
      const data = await fetch('/data/europe-land.json')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
      this._europeLines = Array.isArray(data?.lines) ? data.lines : [];
    } catch (_) { /* offline / file:// — keep the empty fallback */ }
  }

  _drawEuropeBorders() {
    const ctx = this.ctx;

    /* Draw grid lines (skip exact boundary values to avoid doubling the border) */
    ctx.strokeStyle = rgba(THEME.accent2, 0.08);
    ctx.lineWidth = 0.5;

    const ox = this._offsetX || 0;
    const oy = this._offsetY || 0;

    for (let lon = -20; lon <= 40; lon += 10) {
      const x = this._lonToX(lon);
      ctx.beginPath();
      ctx.moveTo(x, oy);
      ctx.lineTo(x, oy + this.h);
      ctx.stroke();
    }
    for (let lat = 30; lat <= 70; lat += 10) {
      const y = this._latToY(lat);
      ctx.beginPath();
      ctx.moveTo(ox, y);
      ctx.lineTo(ox + this.w, y);
      ctx.stroke();
    }

    /* Coastlines, prebuilt by scripts/generate-europe-land.mjs */
    if (!this._europeLines.length) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(this._offsetX || 0, this._offsetY || 0, this.w, this.h);
    ctx.clip();

    /* Stroke-only, never filled. The mainland arrives as one polyline whose
       interior seas (Mediterranean, Black Sea) are holes the TopoJSON decoder
       dropped, so flood-filling it would paint those seas as land — and
       islands have to follow the same rule, or Great Britain renders as a
       solid blob beside a hollow France.

       The two branches that used to live here — "is this ring an island or a
       continent" and "is this vertex near enough to Europe to draw" — are
       gone, not skipped. They decided which subpaths to emit from a worldwide
       ring set, and that decision does not depend on anything only the browser
       knows, so the generator makes it once and ships the subpaths. Three
       stroke passes over 179 short polylines, per frame, instead of the same
       three passes plus a bounds test per vertex over 16.5k vertices. */
    const strokes = [
      [2.5, rgba(THEME.globe.coast, 0.15)],
      [1.5, rgba(THEME.globe.coast, 0.40)],
      [0.7, rgba(THEME.globe.coastBright, 0.85)],
    ];
    for (const [lw, color] of strokes) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = color;
      for (const line of this._europeLines) {
        if (line.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(this._lonToX(line[0][0]), this._latToY(line[0][1]));
        for (let i = 1; i < line.length; i++) {
          ctx.lineTo(this._lonToX(line[i][0]), this._latToY(line[i][1]));
        }
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  _drawPin(pin, isHovered) {
    const ctx = this.ctx;
    const color = this.PIN_COLORS[pin.type] || THEME.text;
    const isLarge = pin.type === 'lived' || pin.type === 'current';
    const size = isHovered ? (isLarge ? 2.8 : 2.2) : EuropeMap2D.PIN_SIZE[pin.type];

    const hex = color.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    /* Subtle outer glow */
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.12)`;
    ctx.beginPath();
    ctx.arc(pin.x, pin.y, size * 2.2, 0, Math.PI * 2);
    ctx.fill();

    /* Solid dot */
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pin.x, pin.y, size, 0, Math.PI * 2);
    ctx.fill();

    /* Bright inner core for emphasis */
    ctx.fillStyle = rgba(THEME.text, isHovered ? 0.7 : 0.5);
    ctx.beginPath();
    ctx.arc(pin.x, pin.y, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    if (this._io) { this._io.disconnect(); this._io = null; }
    for (const { target, type, fn, opts } of (this._listeners || [])) {
      try { target.removeEventListener(type, fn, opts); } catch (_) { /* ignore */ }
    }
    this._listeners = [];
  }
}

if (typeof globalThis !== 'undefined') globalThis.EuropeMap2D = EuropeMap2D;
