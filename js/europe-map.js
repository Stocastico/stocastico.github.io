/* ============================================================
   EUROPE 2D MAP
   ============================================================
   Interactive 2D map of Europe showing location pins
   Uses Canvas2D rendering with neon aesthetic matching the 3D globe
   ============================================================ */

'use strict';

class EuropeMap2D {
  /* Color scheme matches Globe3D */
  static PIN_COLORS = { lived: '#00d4ff', current: '#ffeb00', worktrip: '#0099ff', holiday: '#ff8c42' };
  static PIN_SIZE = { lived: 1.8, current: 1.8, worktrip: 1.4, holiday: 1.4 };

  constructor(canvasEl) {
    if (!canvasEl || canvasEl.tagName !== 'CANVAS') return;
    if (typeof LOCATIONS === 'undefined') {
      console.warn('EuropeMap2D: data/locations.js not loaded — map will not render.');
      return;
    }

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

    /* Performance: cache tooltip refs */
    this._ttType = this.tooltip?.querySelector('.et-type') || null;
    this._ttName = this.tooltip?.querySelector('.et-name') || null;
    this._ttInfo = this.tooltip?.querySelector('.et-info') || null;

    /* Filtered pins — initially all shown */
    this.visibleTypes = new Set(['lived', 'current', 'worktrip', 'holiday']);
    this.filteredPins = [];
    this.filteredTrips = [];

    /* Europe bounding box (simplified): roughly [lon_min, lat_min, lon_max, lat_max] */
    this.bounds = { minLon: -14, maxLon: 40, minLat: 35, maxLat: 71 };

    /* TopoJSON-decoded land rings (filled async) */
    this._europeRings = [];

    this._resize();
    this._buildFilteredPins();
    this._buildFilteredTrips();
    this._bindEvents();
    this._animate();
    this._loadTopoJSON();

    /* Pause when canvas is out of viewport */
    const _ioEurope = new IntersectionObserver(([e]) => {
      this._visible = e.isIntersecting;
      if (this._visible && !this._rafId) this._animate();
    }, { threshold: 0 });
    _ioEurope.observe(canvasEl);

    document.addEventListener('visibilitychange', () => {
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

    this.canvas.width = containerW;
    this.canvas.height = containerH;

    this._rect = this.canvas.getBoundingClientRect();
  }

  _buildFilteredPins() {
    this.filteredPins = (LOCATIONS.pins || [])
      .filter(pin => !pin._skip && this.visibleTypes.has(pin.type))
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
          stroke: trip.color || '#7ce8ff',
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

    this.canvas.addEventListener('mousemove', (e) => {
      this._rect = this.canvas.getBoundingClientRect();
      /* Scale from CSS pixels to canvas bitmap pixels */
      const scaleX = this.canvas.width / this._rect.width;
      const scaleY = this.canvas.height / this._rect.height;
      this.mouse.x = (e.clientX - this._rect.left) * scaleX;
      this.mouse.y = (e.clientY - this._rect.top) * scaleY;
      /* Keep CSS-space coords for tooltip positioning */
      this._cssMouseX = e.clientX - this._rect.left;
      this._cssMouseY = e.clientY - this._rect.top;
      this._mouseOver = true;
      this._rayhit();
      this._ensureAnimating();
    }, false);

    this.canvas.addEventListener('mouseleave', () => {
      this._mouseOver = false;
      this._hideTooltip();
    }, false);

    window.addEventListener('resize', () => {
      this._resize();
      this._buildFilteredPins();
      this._buildFilteredTrips();
      this._rect = null;
    }, false);
  }

  _rayhit() {
    this._hoveredPin = null;
    const hitDist = 10;  /* px hitbox radius — generous for small dots */

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
    this._hideTooltip();
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

    /* Clear */
    ctx.fillStyle = '#020b18';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    /* Draw continental Europe with neon glow */
    this._drawEuropeBorders();

    /* Draw trips below pins so dots stay readable */
    this._drawTrips(t);

    /* Draw location pins */
    this.filteredPins.forEach(pin => {
      this._drawPin(pin, pin === this._hoveredPin);
    });

    /* Draw map border */
    ctx.strokeStyle = 'rgba(0,210,255,0.3)';
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
      ctx.strokeStyle = 'rgba(130, 229, 255, 0.95)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
  }

  _colorToRgba(color, alpha) {
    if (typeof color !== 'string') return `rgba(124, 232, 255, ${alpha})`;

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

  /* ── TopoJSON loader ───────────────────────────────────────────────── */

  async _loadTopoJSON() {
    try {
      const topo = await fetch('./data/land-50m.json')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
      const allRings = this._decodeTopoJSON(topo);
      /* Keep only rings that have at least one vertex inside Europe bounds */
      this._europeRings = allRings.filter(ring => {
        for (let i = 0; i < ring.length; i++) {
          const lon = ring[i][0], lat = ring[i][1];
          if (lon >= this.bounds.minLon && lon <= this.bounds.maxLon &&
              lat >= this.bounds.minLat && lat <= this.bounds.maxLat) {
            return true;
          }
        }
        return false;
      });
    } catch (_) { /* offline / file:// — keep the empty fallback */ }
  }

  _decodeTopoJSON(topo) {
    const { scale, translate } = topo.transform;
    const decodeArc = (idx) => {
      const rev = idx < 0;
      const raw = topo.arcs[rev ? ~idx : idx];
      let cx = 0, cy = 0;
      const pts = raw.map(([dx, dy]) => {
        cx += dx; cy += dy;
        return [cx * scale[0] + translate[0], cy * scale[1] + translate[1]];
      });
      return rev ? pts.reverse() : pts;
    };
    const rings = [];
    for (const geom of topo.objects.land.geometries) {
      const polys = geom.type === 'Polygon' ? [geom.arcs] : geom.arcs;
      for (const poly of polys) {
        const ring = [];
        for (const arcIdx of poly[0]) ring.push(...decodeArc(arcIdx));
        rings.push(ring);
      }
    }
    return rings;
  }

  _drawEuropeBorders() {
    const ctx = this.ctx;

    /* Draw grid lines (skip exact boundary values to avoid doubling the border) */
    ctx.strokeStyle = 'rgba(0,210,255,0.08)';
    ctx.lineWidth = 0.5;

    const ox = this._offsetX || 0;
    const oy = this._offsetY || 0;

    for (let lon = 0; lon <= 30; lon += 10) {
      const x = this._lonToX(lon);
      ctx.beginPath();
      ctx.moveTo(x, oy);
      ctx.lineTo(x, oy + this.h);
      ctx.stroke();
    }
    for (let lat = 40; lat <= 65; lat += 5) {
      const y = this._latToY(lat);
      ctx.beginPath();
      ctx.moveTo(ox, y);
      ctx.lineTo(ox + this.w, y);
      ctx.stroke();
    }

    /* Draw TopoJSON land rings clipped to Europe bounds */
    if (!this._europeRings.length) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(this._offsetX || 0, this._offsetY || 0, this.w, this.h);
    ctx.clip();

    /* Classify rings: "local" (small islands/countries) vs "global" (continent) */
    const isLocal = (ring) => {
      let lo = Infinity, hi = -Infinity;
      for (const [lon] of ring) { if (lon < lo) lo = lon; if (lon > hi) hi = lon; }
      return (hi - lo) < 90;
    };

    /* Padded bounds for segment-filtering large rings */
    const pad = 8;
    const nearMinLon = this.bounds.minLon - pad;
    const nearMaxLon = this.bounds.maxLon + pad;
    const nearMinLat = this.bounds.minLat - pad;
    const nearMaxLat = this.bounds.maxLat + pad;
    const isNear = (lon, lat) =>
      lon >= nearMinLon && lon <= nearMaxLon &&
      lat >= nearMinLat && lat <= nearMaxLat;

    /* Pass 1: fill only local rings (small islands that fill correctly) */
    ctx.fillStyle = '#081624';
    for (const ring of this._europeRings) {
      if (!isLocal(ring)) continue;
      ctx.beginPath();
      ctx.moveTo(this._lonToX(ring[0][0]), this._latToY(ring[0][1]));
      for (let i = 1; i < ring.length; i++) {
        ctx.lineTo(this._lonToX(ring[i][0]), this._latToY(ring[i][1]));
      }
      ctx.closePath();
      ctx.fill();
    }

    /* Pass 2: stroke coastlines.
       Local rings: draw all segments normally.
       Global rings: only draw segments near Europe (eliminates cross-map artifacts). */
    const strokes = [
      [2.5, 'rgba(0,185,235,0.15)'],
      [1.5, 'rgba(0,210,255,0.40)'],
      [0.7, 'rgba(155,242,255,0.85)'],
    ];
    for (const [lw, color] of strokes) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = color;
      for (const ring of this._europeRings) {
        ctx.beginPath();
        if (isLocal(ring)) {
          ctx.moveTo(this._lonToX(ring[0][0]), this._latToY(ring[0][1]));
          for (let i = 1; i < ring.length; i++) {
            ctx.lineTo(this._lonToX(ring[i][0]), this._latToY(ring[i][1]));
          }
        } else {
          /* Segment-filtered: only draw near-Europe segments */
          let prevNear = false;
          for (let i = 0; i < ring.length; i++) {
            const near = isNear(ring[i][0], ring[i][1]);
            const x = this._lonToX(ring[i][0]);
            const y = this._latToY(ring[i][1]);
            if (near) {
              if (!prevNear) {
                if (i > 0) {
                  ctx.moveTo(this._lonToX(ring[i - 1][0]), this._latToY(ring[i - 1][1]));
                  ctx.lineTo(x, y);
                } else {
                  ctx.moveTo(x, y);
                }
              } else {
                ctx.lineTo(x, y);
              }
            } else if (prevNear) {
              ctx.lineTo(x, y);
            }
            prevNear = near;
          }
        }
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  _drawPin(pin, isHovered) {
    const ctx = this.ctx;
    const color = EuropeMap2D.PIN_COLORS[pin.type] || '#ffffff';
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
    ctx.fillStyle = `rgba(255,255,255,${isHovered ? 0.7 : 0.5})`;
    ctx.beginPath();
    ctx.arc(pin.x, pin.y, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}
