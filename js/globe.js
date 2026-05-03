/* ═══════════════════════════════════════════════════════════
   3D GLOBE + 2D fallback

   Exports:
   - geocodeLocations(LOCATIONS): fills missing lat/lon via
     Nominatim and caches results back into the LOCATIONS object.
   - Globe3D: Three.js / WebGL interactive globe.
   - GlobeFallback2D: Canvas2D fallback when WebGL is unavailable.
   ═══════════════════════════════════════════════════════════ */
import { onChange } from './three-context.js';
import {
  isLowPowerDevice,
  prefersReducedMotion,
  hasWebGLSupport,
  getTopoJSON,
} from './utils.js';

let THREE;
onChange((t) => { THREE = t; });

/* ═══════════════════════════════════════════════════════════
   GEOCODING  (OpenStreetMap Nominatim — free, no key needed)
   Fills lat/lon for any LOCATIONS entry that omits them.
   Runs once at page load; respects 1-req/sec Nominatim ToS.
   ═══════════════════════════════════════════════════════════ */
export async function geocodeLocations(locs) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const API = 'https://nominatim.openstreetmap.org/search';

  /* Collect every item missing coordinates into a flat list */
  const pending = [];
  const collect = (obj) => { if (obj.lat == null || obj.lon == null) pending.push(obj); };
  (locs.pins || []).forEach(collect);
  (locs.regions || []).forEach(collect);
  (locs.trips || []).forEach(t => (t.cities || []).forEach(collect));

  if (!pending.length) return;   /* nothing to do — all coords already provided */

  for (let i = 0; i < pending.length; i++) {
    if (i > 0) await sleep(1100);   /* max 1 req/sec — Nominatim ToS */
    const item = pending[i];
    try {
      const url = `${API}?q=${encodeURIComponent(item.name)}&format=json&limit=1`;
      const res = await fetch(url);
      const json = await res.json();
      if (!json.length) throw new Error('no results');
      item.lat = parseFloat(json[0].lat);
      item.lon = parseFloat(json[0].lon);
      console.info(`[Globe] geocoded "${item.name}" → (${item.lat.toFixed(3)}, ${item.lon.toFixed(3)})`);
    } catch (e) {
      console.warn(`[Globe] geocoding failed for "${item.name}": ${e.message} — pin skipped`);
      item._skip = true;
    }
  }
}

/* ── Fallback continent polygon data (used only when data/world-110m.json
   cannot be fetched, e.g. local file:// dev without a server).
   Each element: [[lat, lon], …] — closed polygon in geographic coordinates. */
const GLOBE_CONTINENTS = [
  /* North America */
  [[71,-164],[66,-168],[61,-150],[57,-136],[49,-124],[42,-124],[37,-122],
   [32,-117],[29,-110],[23,-106],[15,-90],[9,-84],[8,-77],[11,-61],[17,-62],
   [21,-74],[26,-80],[30,-81],[35,-76],[41,-70],[45,-64],[47,-53],[52,-56],
   [57,-62],[63,-78],[68,-84],[72,-79],[76,-93],[73,-124],[71,-164]],
  /* Greenland */
  [[83,-34],[76,-14],[72,-22],[65,-37],[60,-44],[60,-48],[64,-52],[68,-54],
   [74,-57],[76,-68],[82,-72],[83,-34]],
  /* South America */
  [[12,-71],[8,-60],[2,-51],[-5,-35],[-10,-37],[-16,-38],[-23,-43],
   [-34,-53],[-34,-58],[-52,-60],[-55,-68],[-50,-68],[-47,-65],[-40,-62],
   [-27,-49],[-22,-43],[-10,-37],[-1,-49],[5,-52],[8,-59],[12,-71]],
  /* Europe (mainland + Iberia + Scandinavia) */
  [[36,-9],[43,-9],[44,-8],[48,-4],[51,3],[52,5],[57,8],[65,14],[71,28],
   [66,25],[60,24],[55,20],[52,24],[46,30],[45,29],[43,23],[42,20],[38,22],
   [37,22],[38,16],[40,18],[41,14],[44,13],[44,8],[43,3],[43,-2],[36,-6],
   [36,-9]],
  /* Italy (peninsula) */
  [[47,14],[45,13],[44,8],[43,8],[43,11],[41,13],[38,16],[38,15],
   [39,17],[40,18],[41,15],[44,14],[47,14]],
  /* UK + Ireland */
  [[58,-5],[57,-2],[53,-5],[52,-5],[51,-3],[50,0],[51,1],[53,0],[55,-2],[58,-5]],
  /* Iceland */
  [[64,-24],[65,-14],[66,-14],[66,-18],[64,-24]],
  /* Africa */
  [[37,10],[33,33],[22,37],[12,44],[11,43],[8,50],[2,45],
   [-5,40],[-11,37],[-22,35],[-26,33],[-34,27],[-35,19],[-34,18],
   [-29,17],[-15,12],[-11,14],[-5,10],[4,2],[5,3],[5,1],[4,-2],
   [5,-4],[7,-6],[11,-15],[15,-17],[18,-16],[22,-17],[27,-14],[35,-6],
   [37,10]],
  /* Madagascar */
  [[-13,49],[-16,50],[-21,47],[-25,47],[-26,44],[-20,44],[-14,49],[-13,49]],
  /* Asia (mainland — Arabian Pen., Indian subcontinent, SE Asia included) */
  [[73,55],[77,100],[71,140],[68,162],[60,163],[54,142],[50,140],
   [44,136],[40,124],[32,121],[22,114],[19,109],[10,105],[2,104],
   [2,101],[4,100],[7,100],[14,100],[17,100],[22,103],[22,93],
   [21,87],[13,80],[8,77],[22,66],[25,57],[24,58],
   [23,60],[30,50],[40,50],[44,40],[43,38],[41,34],[39,27],[37,28],
   [37,22],[41,20],[42,38],[45,38],[56,38],[56,52],[60,59],[67,65],
   [73,55]],
  /* Sri Lanka */
  [[10,80],[9,80],[6,81],[6,80],[8,77],[10,80]],
  /* Japan (Honshu + Shikoku + Kyushu combined) */
  [[41,141],[40,140],[36,136],[34,131],[33,130],[34,132],[36,135],
   [37,137],[40,140],[42,140],[41,141]],
  /* Hokkaido */
  [[44,141],[44,143],[43,145],[43,141],[44,141]],
  /* Australia */
  [[-14,127],[-14,136],[-10,136],[-13,142],[-16,145],[-21,149],
   [-26,153],[-32,152],[-34,151],[-38,146],[-38,140],[-38,141],
   [-32,133],[-35,137],[-34,135],[-31,129],[-23,113],[-21,114],
   [-17,122],[-14,127]],
  /* New Zealand — South Island */
  [[-46,167],[-46,168],[-44,171],[-43,173],[-42,171],[-43,170],[-44,168],[-46,167]],
  /* New Zealand — North Island */
  [[-38,174],[-37,175],[-37,176],[-39,176],[-41,175],[-40,172],[-38,174]],
];

/* ═══════════════════════════════════════════════════════════
   GLOBE 3D — interactive world map in the About section
   Location data lives in  data/locations.js  (edit that file).
   ═══════════════════════════════════════════════════════════ */
export class Globe3D {

  /* Four-colour scheme:
       cyan   (#00d4ff) — lived places (past homes)
       yellow (#ffeb00) — current home
       blue   (#0099ff) — worktrips (work locations)
       coral  (#ff8c42) — holidays + trips + regions (exploration)
     Visual weight still differentiates lived/current (large, pulsing)
     from worktrip/holiday (small, static) even within colour groups. */
  static PIN_COLORS = { lived: 0x00d4ff, current: 0xffeb00, worktrip: 0x0099ff, holiday: 0xff8c42 };

  static TT_LABEL = { lived: '● Lived', current: '● Current', worktrip: '◆ Worktrip', holiday: '✦ Holiday', trip: '➜ Trip stop' };
  static TT_COLOR = { lived: '#00d4ff', current: '#ffeb00', worktrip: '#0099ff', holiday: '#ff8c42', trip: '#e8edf8' };

  constructor(canvasEl) {
    if (!canvasEl || typeof THREE === 'undefined') return;
    if (typeof LOCATIONS === 'undefined') {
      console.warn('Globe3D: data/locations.js not loaded — globe will not render.');
      return;
    }

    this.canvas = canvasEl;
    this.parent = canvasEl.parentElement;
    this.tooltip = document.getElementById('globe-tooltip');
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Mesh = { threshold: 0.012 };   /* generous hitbox for small pins */
    this.mouse = new THREE.Vector2(-9, -9);
    this._mpos = { x: 0, y: 0 };
    this.pulseRings = [];
    this.markerMeshes = [];
    this.tripAnimations = [];
    this.isDragging = false;
    this.prevMouse = { x: 0, y: 0 };
    this.rotX = 0.25;
    this.rotY = -1.6;   /* initial view: Europe faces camera */
    this.velX = 0;
    this.velY = 0;

    /* Performance: cache tooltip child refs (avoids querySelector every frame) */
    this._ttType = this.tooltip?.querySelector('.gt-type') || null;
    this._ttName = this.tooltip?.querySelector('.gt-name') || null;
    this._ttInfo = this.tooltip?.querySelector('.gt-info') || null;

    /* Performance: skip raycasting when the cursor is outside the canvas */
    this._mouseOver = false;
    /* Performance: cached bounding rect — invalidated on resize */
    this._rect = null;
    /* RAF id for pause/resume */
    this._rafId = null;
    /* Visibility flags */
    this._globeVisible = true;

    /* The mesh the cursor is currently hovering (scaled up for feedback) */
    this._hoveredMesh = null;
    this._isLowPower = isLowPowerDevice();
    this._pixelRatioCap = this._isLowPower ? 1.25 : 1.5;
    this._starCount = this._isLowPower ? 900 : 1400;
    this._tripCurvePoints = this._isLowPower ? 64 : 96;
    this._frameStep = this._isLowPower ? 2 : 1;
    this._frameTick = 0;
    /* FPS cap — globe rotates at 0.0014 rad/frame; 45 fps is visually
       indistinguishable from 60/120 fps and halves GPU work on Retina. */
    this._minFrameTime = 1 / (this._isLowPower ? 30 : 45);
    this._lastDrawTime = 0;

    /* Filtered pins — initially all types visible */
    this.visibleTypes = new Set(['lived', 'current', 'worktrip', 'holiday']);

    this._resize();
    this._initScene();
    this._buildGlobe();
    this._buildAtmosphere();
    this._buildStars();
    this._buildGrid();
    this._buildMarkers();
    this._buildTrips();
    this._bindEvents();
    this._animate();

    /* Store reference on canvas for external access (filtering) */
    this.canvas._globe = this;

    /* Pause when canvas is out of the viewport */
    const _ioGlobe = new IntersectionObserver(([e]) => {
      this._globeVisible = e.isIntersecting;
      if (this._globeVisible && !this._rafId) this._animate();
    }, { threshold: 0 });
    _ioGlobe.observe(canvasEl);

    /* Pause when the browser tab is hidden */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this._rafId) this._animate();
    });
  }

  /* ── Internals ──────────────────────────────────────────── */

  _resize() {
    this.w = this.parent.clientWidth || 800;
    this.h = this.parent.clientHeight || 500;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, this.w / this.h, 0.01, 100);
    this.camera.position.z = 2.75;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this._isLowPower,
      alpha: true,
      powerPreference: this._isLowPower ? 'low-power' : 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min((typeof devicePixelRatio === 'number' ? devicePixelRatio : 1), this._pixelRatioCap));
    this.renderer.setSize(this.w, this.h);
    this.renderer.setClearColor(0x000000, 0);

    if (typeof this.canvas.addEventListener === 'function') {
      this.canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this._rafId = null;
      }, false);
      this.canvas.addEventListener('webglcontextrestored', () => {
        this.renderer.setSize(this.w, this.h);
        if (!this._rafId) this._animate();
      }, false);
    }

    /* Ambient: cool fill — keeps the dark ocean dark */
    this.scene.add(new THREE.AmbientLight(0x0d1f3a, 1.2));
    /* Cool-blue key light — replaces the warm sun (no longer needed without photo texture) */
    const key = new THREE.DirectionalLight(0x2255bb, 0.55);
    key.position.set(4, 2, 3);
    this.scene.add(key);
    /* Cyan rim on the opposite side — stronger to complement the neon style */
    const rim = new THREE.PointLight(0x00d4ff, 0.9, 14);
    rim.position.set(-4, 1, -2);
    this.scene.add(rim);
    /* Purple fill from below — adds depth */
    const fill = new THREE.PointLight(0x6c44ff, 0.45, 12);
    fill.position.set(2, -2, -3);
    this.scene.add(fill);

    this.pivot = new THREE.Group();
    this.pivot.rotation.x = this.rotX;
    this.pivot.rotation.y = this.rotY;
    this.scene.add(this.pivot);
  }

  /* ── TopoJSON decoder ──────────────────────────────────────────────────────
     Converts a Natural-Earth land TopoJSON (data/world-110m.json) into an
     array of rings, each ring being an array of [lon, lat] pairs.            */
  _decodeTopoJSON(topo) {
    const { scale, translate } = topo.transform;

    /* Decode one arc (delta-encoded integers → geographic [lon, lat]) */
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
        /* Join all arc segments that form the outer ring (index 0); skip holes */
        const ring = [];
        for (const arcIdx of poly[0]) ring.push(...decodeArc(arcIdx));
        rings.push(ring);
      }
    }
    return rings;
  }

  /* rings: array of [[lon, lat], …] polygons (GeoJSON coordinate order).
     cvs and _THREE are captured synchronously before any await so that the
     async completion in _buildGlobe() never reads from globals after they
     may have been restored (e.g. in test teardown).                         */
  _buildGlobeTexture(rings, cvs, _THREE) {
    const W = 2048, H = 1024;
    cvs.width = W; cvs.height = H;
    const ctx = cvs.getContext('2d');

    /* Deep-ocean background */
    ctx.fillStyle = '#030d1c';
    ctx.fillRect(0, 0, W, H);

    /* lon, lat → canvas pixel (equirectangular) */
    const px = (lon, lat) => [(lon + 180) / 360 * W, (90 - lat) / 180 * H];

    /* Antarctica: filled band at bottom of map */
    const antY = (90 - (-68)) / 180 * H;
    ctx.fillStyle = '#0e2640';
    ctx.fillRect(0, antY, W, H - antY);

    /* Draw one ring with a multi-pass neon glow stroke */
    const drawRing = ring => {
      ctx.beginPath();
      const [x0, y0] = px(ring[0][0], ring[0][1]);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < ring.length; i++) {
        const [x, y] = px(ring[i][0], ring[i][1]);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#0e2640';
      ctx.fill();
      /* outer glow halo */ ctx.lineWidth = 5;   ctx.strokeStyle = 'rgba(0,185,235,0.25)'; ctx.stroke();
      /* mid glow        */ ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,210,255,0.60)'; ctx.stroke();
      /* bright core     */ ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(155,242,255,1.00)'; ctx.stroke();
    };

    /* Paint European land with dark neon violet BEFORE the neon coastlines
       so that the glow strokes are visible on top of the fill.
       Clip to each land polygon individually (not the rectangle) so that
       only actual land areas receive the fill — avoids purple bleeding into sea. */
    const europeMinLon = -10; const europeMaxLon = 40;
    const europeMinLat = 35;  const europeMaxLat = 71;
    const [clipX0, clipY0] = px(europeMinLon, europeMaxLat);
    const [clipX1, clipY1] = px(europeMaxLon, europeMinLat);

    const overlapsEuropeBounds = (ring) => {
      for (let i = 0; i < ring.length; i++) {
        const lon = ring[i][0];
        const lat = ring[i][1];
        if (lon >= europeMinLon && lon <= europeMaxLon && lat >= europeMinLat && lat <= europeMaxLat) {
          return true;
        }
      }
      return false;
    };

    rings.forEach((ring) => {
      if (!overlapsEuropeBounds(ring)) return;
      ctx.save();
      /* Clip to the Europe rectangle first */
      ctx.beginPath();
      ctx.rect(clipX0, clipY0, clipX1 - clipX0, clipY1 - clipY0);
      ctx.clip();
      /* Then clip to the land polygon — intersection = land within Europe */
      ctx.beginPath();
      const [x0, y0] = px(ring[0][0], ring[0][1]);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < ring.length; i++) {
        const [x, y] = px(ring[i][0], ring[i][1]);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.clip();
      /* Fill — only visible where both clips overlap (land in Europe) */
      ctx.fillStyle = '#4e2870';
      ctx.fillRect(clipX0, clipY0, clipX1 - clipX0, clipY1 - clipY0);
      ctx.restore();
    });

    /* Draw all land rings with neon glow (on top of the Europe violet fill) */
    rings.forEach(drawRing);

    /* Antarctica border line */
    ctx.lineWidth = 2;   ctx.strokeStyle = 'rgba(0,210,255,0.50)';
    ctx.beginPath(); ctx.moveTo(0, antY); ctx.lineTo(W, antY); ctx.stroke();
    ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(155,242,255,0.95)';
    ctx.beginPath(); ctx.moveTo(0, antY); ctx.lineTo(W, antY); ctx.stroke();

    return new _THREE.CanvasTexture(cvs);
  }

  async _buildGlobe() {
    /* ── Procedural neon-continent texture ────────────────────────────────────
       Fetches data/world-110m.json (Natural Earth 110m TopoJSON, 54 KB),
       decodes it inline, draws 125 precise land rings on a neon-cyan canvas
       texture, and maps it onto the sphere.  Falls back to the simplified
       GLOBE_CONTINENTS polygons if the fetch fails (e.g. file:// dev).

       THREE and cvs are captured synchronously before any await so that the
       async continuation never reads globals after test teardown restores them. */
    const _THREE = THREE; /* eslint-disable-line no-undef */
    const cvs = document.createElement('canvas');

    const mat = new _THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    this.pivot.add(new _THREE.Mesh(new _THREE.SphereGeometry(1, 64, 64), mat));

    try {
      const topo  = await getTopoJSON();
      const rings = this._decodeTopoJSON(topo);
      const tex   = this._buildGlobeTexture(rings, cvs, _THREE);
      mat.map = tex;
      mat.needsUpdate = true;
    } catch (_) {
      /* Fallback: hand-drawn polygons (stored as [lat,lon] — swap to [lon,lat]) */
      const rings = GLOBE_CONTINENTS.map(pts => pts.map(([lat, lon]) => [lon, lat]));
      const tex   = this._buildGlobeTexture(rings, cvs, _THREE);
      mat.map = tex;
      mat.needsUpdate = true;
    }
  }

  _buildAtmosphere() {
    /* Inner surface glow — neon cyan tint */
    this.pivot.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.007, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.07, depthWrite: false }),
    ));
    /* Atmosphere shell — deep electric blue */
    this.pivot.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.14, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x1166ee, transparent: true, opacity: 0.13, side: THREE.BackSide, depthWrite: false }),
    ));
    /* Wide outer halo — violet, additive */
    this.scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.24, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x6c63ff, transparent: true, opacity: 0.055, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    ));
  }

  _buildStars() {
    /* Distribute stars on a large sphere around the scene */
    const COUNT = this._starCount;
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 8 + Math.random() * 4;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(geo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.018, transparent: true, opacity: 0.5, sizeAttenuation: true }),
    ));
  }

  _buildGrid() {
    /* Neon cyan lat-lon grid with additive blending for glow */
    const mat = (op, bright) => new THREE.LineBasicMaterial({
      color: bright ? 0x00ffff : 0x00c8f0,
      transparent: true, opacity: op,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const R = 1.002;
    for (let lat = -80; lat <= 80; lat += 20) {
      const phi = (90 - lat) * Math.PI / 180;
      const r = R * Math.sin(phi), y = R * Math.cos(phi), pts = [];
      for (let i = 0; i <= 64; i++) { const t = (i / 64) * Math.PI * 2; pts.push(new THREE.Vector3(r * Math.cos(t), y, r * Math.sin(t))); }
      this.pivot.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat(lat === 0 ? 0.55 : 0.20, lat === 0)));
    }
    for (let lon = 0; lon < 360; lon += 20) {
      const theta = lon * Math.PI / 180, pts = [];
      for (let i = 0; i <= 64; i++) { const p = (i / 64) * Math.PI; pts.push(new THREE.Vector3(R * Math.sin(p) * Math.cos(theta), R * Math.cos(p), R * Math.sin(p) * Math.sin(theta))); }
      this.pivot.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat(0.20, false)));
    }
  }

  /* Lat/lon → THREE.Vector3 on a sphere of radius r */
  _ll(lat, lon, r) {
    const phi = (90 - lat) * Math.PI / 180, theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
  }

  /* Orient a flat mesh (CircleGeometry / RingGeometry) to lie on the sphere surface */
  _faceOut(mesh, pos) {
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pos.clone().normalize());
  }

  /* ── Standard pins (lived / work / travel) ──────────────── */
  _buildMarkers() {
    (LOCATIONS.pins || [])
      .filter(loc => {
        if (loc._skip) return false;
        /* Hide European worktrips and holidays on globe — show only on 2D map */
        if ((loc.type === 'worktrip' || loc.type === 'holiday') && 
            loc.lat >= 35 && loc.lat <= 71 && 
            loc.lon >= -10 && loc.lon <= 40) {
          return false;
        }
        return true;
      })
      .forEach(loc => {
      const hex = Globe3D.PIN_COLORS[loc.type] || 0xffffff;
      const color = new THREE.Color(hex);
      const pos = this._ll(loc.lat, loc.lon, 1.008);
      const surf = this._ll(loc.lat, loc.lon, 1.001);
      const isHome = (loc.type === 'lived' || loc.type === 'current');   /* bigger, pulsing — "I live/lived here" */

      /* Spike — thin line from globe surface up to the dot */
      this.pivot.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([surf, pos]),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: isHome ? 0.55 : 0.30 }),
      ));

      /* Dot — small, similar to trip city-stop dots */
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(isHome ? 0.006 : 0.005, 10, 10),
        new THREE.MeshBasicMaterial({ color }),
      );
      dot.position.copy(pos);
      this.pivot.add(dot);

      /* Invisible hit-test sphere — much larger for reliable hover detection.
         Raycaster threshold is ignored for Mesh objects, so we need actual
         geometry large enough to intersect the ray. */
      const hitArea = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 8, 8),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hitArea.position.copy(pos);
      hitArea.userData = { name: loc.name, info: loc.info, type: loc.type };
      this.pivot.add(hitArea);
      this.markerMeshes.push(hitArea);

      /* Subtle halo ring — just enough to make the dot readable */
      const [rIn, rOut, op] = isHome ? [0.006, 0.008, 0.30] : [0.005, 0.0065, 0.18];
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(rIn, rOut, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }),
      );
      halo.position.copy(pos);
      this._faceOut(halo, pos);
      this.pivot.add(halo);

      /* Single subtle pulse ring — only for lived/home pins */
      if (isHome) {
        [0, Math.PI].forEach(phaseOffset => {
          const pulse = new THREE.Mesh(
            new THREE.RingGeometry(0.004, 0.006, 32),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
          );
          pulse.position.copy(pos);
          this._faceOut(pulse, pos);
          pulse.userData = { phase: phaseOffset, speed: 0.42 };
          this.pivot.add(pulse);
          this.pulseRings.push(pulse);
        });
      }
    });
  }

  /* ── Trip paths with animated traveller + comet trail ───── */
  _buildTrips() {
    (LOCATIONS.trips || []).forEach(trip => {
      const color = new THREE.Color(trip.color || '#ff8c42');
      const cities = (trip.cities || []).filter(c => !c._skip);
      if (cities.length < 2) return;

      const curves = [];
      const segLens = [];
      let total = 0;

      for (let i = 0; i < cities.length - 1; i++) {
        const s = this._ll(cities[i].lat, cities[i].lon, 1.006);
        const e = this._ll(cities[i + 1].lat, cities[i + 1].lon, 1.006);

        /* Adaptive arc height — low lift for short hops (typical trips),
           scales up only for genuinely long-haul segments.
           Guard against near-antipodal pairs (sum ≈ 0) by falling back
           to a perpendicular control point. */
        const chord = s.distanceTo(e);
        const lift = 1.0 + Math.min(0.28, 0.02 + chord * 0.18);
        const sum = s.clone().add(e);
        if (sum.length() < 0.001) sum.set(1, 0, 0).cross(s).normalize();
        else sum.normalize();
        const mid = sum.multiplyScalar(lift);

        const curve = new THREE.QuadraticBezierCurve3(s, mid, e);
        curves.push(curve);
        const len = curve.getLength();
        segLens.push(len);
        total += len;

        const pts = curve.getPoints(this._tripCurvePoints);
        /* Soft outer glow */
        this.pivot.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }),
        ));
        /* Bright core */
        this.pivot.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false }),
        ));
      }

      /* City-stop dots */
      const seen = new Set();
      cities.forEach(city => {
        const key = `${city.lat},${city.lon}`;
        if (seen.has(key)) return;
        seen.add(key);
        const cpos = this._ll(city.lat, city.lon, 1.010);
        const cdot = new THREE.Mesh(
          new THREE.SphereGeometry(0.006, 8, 8),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 }),
        );
        cdot.position.copy(cpos);
        this.pivot.add(cdot);

        /* Invisible hit-test sphere for reliable hover */
        const cHit = new THREE.Mesh(
          new THREE.SphereGeometry(0.025, 8, 8),
          new THREE.MeshBasicMaterial({ visible: false }),
        );
        cHit.position.copy(cpos);
        cHit.userData = { name: city.name, info: trip.name, type: 'trip' };
        this.pivot.add(cHit);
        this.markerMeshes.push(cHit);
      });

      /* Traveller dot — explicit opacity:0 to avoid a 1-frame opaque flash */
      const traveller = new THREE.Mesh(
        new THREE.SphereGeometry(0.009, 12, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }),
      );
      this.pivot.add(traveller);

      /* Comet trail — 6 progressively smaller/dimmer dots trailing behind */
      const TRAIL = 6;
      const trail = [];
      for (let ti = 0; ti < TRAIL; ti++) {
        const frac = 1 - ti / TRAIL;
        const td = new THREE.Mesh(
          new THREE.SphereGeometry(Math.max(0.002, 0.008 * frac * 0.8), 8, 8),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }),
        );
        this.pivot.add(td);
        trail.push(td);
      }

      this.tripAnimations.push({
        curves, segLens, total,
        particle: traveller,
        trail,
        cycleSec: trip.cycleSec || 28,
        offset: Math.random(),
      });
    });
  }

  /* Return the 3-D position on trip anim at fractional time gT ∈ [0,1) */
  _tripPos(anim, gT) {
    const norm = ((gT % 1) + 1) % 1;
    let rem = norm * anim.total;
    for (let i = 0; i < anim.segLens.length; i++) {
      if (rem <= anim.segLens[i] + 1e-6) {
        return anim.curves[i].getPoint(Math.min(rem / Math.max(anim.segLens[i], 1e-6), 1));
      }
      rem -= anim.segLens[i];
    }
    return anim.curves[anim.curves.length - 1].getPoint(1);
  }

  /* ── Events ─────────────────────────────────────────────── */
  _bindEvents() {
    const cv = this.canvas;
    const start = (x, y) => { this.isDragging = true; this.prevMouse = { x, y }; this.velX = this.velY = 0; };
    const move = (x, y) => {
      if (this.isDragging) {
        const dx = x - this.prevMouse.x, dy = y - this.prevMouse.y;
        this.velX = dy * 0.005; this.velY = dx * 0.005;
        this.rotX = Math.max(-1.2, Math.min(1.2, this.rotX + dy * 0.005));
        this.rotY += dx * 0.005;
        this.prevMouse = { x, y };
      }
      /* Refresh rect every move to avoid stale position after scroll/layout changes */
      this._rect = cv.getBoundingClientRect();
      const rect = this._rect;
      this._mpos = { x: x - rect.left, y: y - rect.top };
      this.mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = ((y - rect.top) / rect.height) * -2 + 1;
    };
    const end = () => { this.isDragging = false; };

    cv.addEventListener('mousedown', e => start(e.clientX, e.clientY));
    window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
    window.addEventListener('mouseup', end);
    /* mouseenter / mouseleave gate raycasting to when the cursor is
       actually over the canvas — huge win when browsing other sections */
    cv.addEventListener('mouseenter', () => { this._mouseOver = true; });
    cv.addEventListener('mouseleave', () => {
      this._mouseOver = false;
      if (this._hoveredMesh) {
        this._hoveredMesh.scale.setScalar(1);
        this._hoveredMesh = null;
      }
      this.tooltip?.classList.remove('visible');
    });
    cv.addEventListener('touchstart', e => start(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    cv.addEventListener('touchmove', e => { e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
    cv.addEventListener('touchend', end);
    window.addEventListener('resize', () => {
      this._rect = null;   /* invalidate cached bounding rect */
      this._resize();
      this.camera.aspect = this.w / this.h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.w, this.h);
      this.renderer.setPixelRatio(Math.min((typeof devicePixelRatio === 'number' ? devicePixelRatio : 1), this._pixelRatioCap));
    });
  }

  /* ── Render loop ────────────────────────────────────────── */
  _animate() {
    /* Stop the loop when the tab is hidden or the globe is off-screen */
    if (document.hidden || !this._globeVisible) { this._rafId = null; return; }
    this._rafId = requestAnimationFrame(() => this._animate());
    if ((this._frameTick++ % this._frameStep) !== 0) return;
    /* FPS cap on top of the frame-stepper: keeps draw rate at 45 fps
       (30 on low-power) regardless of the host display refresh rate. */
    const tNow = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    if (this._lastDrawTime && (tNow - this._lastDrawTime) < this._minFrameTime) return;
    this._lastDrawTime = tNow;

    const t = performance.now() * 0.001;   /* seconds */

    /* Globe rotation — smooth inertia + organic auto-spin.
       Lerp velY toward the target speed so it accelerates into the
       auto-spin after a drag, with no threshold jerk. */
    if (!this.isDragging) {
      const TARGET_SPIN = 0.0014;
      this.velX *= 0.92;
      this.velY += (TARGET_SPIN - this.velY) * 0.018;
      this.rotX = Math.max(-1.2, Math.min(1.2, this.rotX + this.velX));
      this.rotY += this.velY;
    }
    this.pivot.rotation.x = this.rotX;
    this.pivot.rotation.y = this.rotY;

    /* Pulse rings — two per lived pin, staggered by π */
    this.pulseRings.forEach(ring => {
      const norm = ((t * ring.userData.speed + ring.userData.phase) % (Math.PI * 2)) / (Math.PI * 2);
      ring.scale.set(1 + norm * 2.2, 1 + norm * 2.2, 1);
      ring.material.opacity = (1 - norm) * 0.45;
    });

    /* Trip travellers + comet trails */
    this.tripAnimations.forEach(anim => {
      const globalT = ((t / anim.cycleSec) + anim.offset) % 1;
      const TRAIL_GAP = 0.022;   /* fractional time gap between each trail dot */

      anim.particle.position.copy(this._tripPos(anim, globalT));
      anim.particle.material.opacity = 0.92;

      anim.trail.forEach((dot, ti) => {
        dot.position.copy(this._tripPos(anim, globalT - (ti + 1) * TRAIL_GAP));
        dot.material.opacity = (1 - (ti + 1) / (anim.trail.length + 1)) * 0.75;
      });
    });

    /* Hover raycasting — only when the cursor is over the canvas.
       This eliminates all raycasting cost during normal page browsing
       and on touch devices (where mouseenter never fires). */
    if (this._mouseOver && this.markerMeshes.length) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hits = this.raycaster.intersectObjects(this.markerMeshes);
      if (hits.length > 0) {
        const hit = hits[0].object;
        /* Scale up the hovered hit-area; reset the previously hovered one */
        if (this._hoveredMesh !== hit) {
          if (this._hoveredMesh) this._hoveredMesh.scale.setScalar(1);
          hit.scale.setScalar(2.0);
          this._hoveredMesh = hit;
          this.canvas.style.cursor = 'pointer';
        }
        const { name, info, type } = hit.userData;
        if (this.tooltip) {
          this._ttType.textContent = Globe3D.TT_LABEL[type] || type;
          this._ttType.style.color = Globe3D.TT_COLOR[type] || '#e8edf8';
          this._ttName.textContent = name;
          this._ttInfo.textContent = '';
          let tx = this._mpos.x + 18, ty = this._mpos.y - 14;
          if (tx + 220 > this.w) tx = this._mpos.x - 228;
          if (ty + 90 > this.h) ty = this._mpos.y - 96;
          if (ty < 4) ty = 4;
          this.tooltip.style.left = tx + 'px';
          this.tooltip.style.top = ty + 'px';
          this.tooltip.classList.add('visible');
        }
      } else {
        if (this._hoveredMesh) { this._hoveredMesh.scale.setScalar(1); this._hoveredMesh = null; this.canvas.style.cursor = ''; }
        this.tooltip?.classList.remove('visible');
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

/* CPU fallback when WebGL is unavailable: 2D orthographic globe */
export class GlobeFallback2D {
  static PIN_COLORS = { lived: '#00d4ff', current: '#ffeb00', worktrip: '#0099ff', holiday: '#ff8c42' };

  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.parent = canvasEl.parentElement;
    this.ctx = canvasEl.getContext('2d', { alpha: true });
    if (!this.ctx) return;
    this._visible = true;
    this._rafId = null;
    this._isLowPower = isLowPowerDevice();
    this._rot = -1.55;
    this._spin = this._isLowPower ? 0.001 : 0.0016;
    this._drag = false;
    this._prevX = 0;
    this._points = [];
    /* FPS cap — 30 fps is plenty for a slow-spinning 2D globe. */
    this._minFrameTime = 1 / 30;
    this._lastDrawTime = 0;

    this._collectPoints();
    this._resize();
    this._bindEvents();
    this._animate();

    const io = new IntersectionObserver(([entry]) => {
      this._visible = entry.isIntersecting;
      if (this._visible && !this._rafId) this._animate();
    }, { threshold: 0 });
    io.observe(canvasEl);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this._rafId) this._animate();
    });
  }

  _collectPoints() {
    this._points.length = 0;
    (LOCATIONS.pins || []).forEach((p) => {
      if (p._skip) return;
      this._points.push({ lat: p.lat, lon: p.lon, type: p.type });
    });
  }

  _resize() {
    this.w = this.parent?.clientWidth || 800;
    this.h = this.parent?.clientHeight || 500;
    const dpr = Math.min(window.devicePixelRatio || 1, this._isLowPower ? 1.2 : 1.7);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cx = this.w * 0.5;
    this.cy = this.h * 0.52;
    this.r = Math.min(this.w, this.h) * 0.3;
  }

  _bindEvents() {
    this.canvas.addEventListener('mousedown', (e) => { this._drag = true; this._prevX = e.clientX; });
    window.addEventListener('mousemove', (e) => {
      if (!this._drag) return;
      const dx = e.clientX - this._prevX;
      this._rot += dx * 0.0045;
      this._prevX = e.clientX;
    });
    window.addEventListener('mouseup', () => { this._drag = false; });
    this.canvas.addEventListener('touchstart', (e) => { if (e.touches[0]) { this._drag = true; this._prevX = e.touches[0].clientX; } }, { passive: true });
    this.canvas.addEventListener('touchmove', (e) => {
      if (!this._drag || !e.touches[0]) return;
      const dx = e.touches[0].clientX - this._prevX;
      this._rot += dx * 0.0045;
      this._prevX = e.touches[0].clientX;
    }, { passive: true });
    this.canvas.addEventListener('touchend', () => { this._drag = false; });
    window.addEventListener('resize', () => this._resize());
  }

  _project(lat, lon) {
    const phi = (lat * Math.PI) / 180;
    const lam = (lon * Math.PI) / 180 + this._rot;
    const cosPhi = Math.cos(phi);
    const x = cosPhi * Math.sin(lam);
    const y = Math.sin(phi);
    const z = cosPhi * Math.cos(lam);
    return { x: this.cx + this.r * x, y: this.cy - this.r * y, z };
  }

  _drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(210,220,255,0.14)';
    ctx.lineWidth = 1;
    for (let lat = -60; lat <= 60; lat += 30) {
      let open = false;
      ctx.beginPath();
      for (let lon = -180; lon <= 180; lon += 4) {
        const p = this._project(lat, lon);
        if (p.z <= 0) { open = false; continue; }
        if (!open) { ctx.moveTo(p.x, p.y); open = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    for (let lon = -150; lon <= 150; lon += 30) {
      let open = false;
      ctx.beginPath();
      for (let lat = -85; lat <= 85; lat += 3) {
        const p = this._project(lat, lon);
        if (p.z <= 0) { open = false; continue; }
        if (!open) { ctx.moveTo(p.x, p.y); open = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  }

  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    const bg = ctx.createRadialGradient(this.cx - this.r * 0.25, this.cy - this.r * 0.35, this.r * 0.2, this.cx, this.cy, this.r * 1.25);
    bg.addColorStop(0, 'rgba(56,96,170,0.9)');
    bg.addColorStop(0.55, 'rgba(16,34,70,0.92)');
    bg.addColorStop(1, 'rgba(5,14,34,0.96)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.r, 0, Math.PI * 2);
    ctx.fill();

    this._drawGrid();

    this._points.forEach((pt) => {
      const p = this._project(pt.lat, pt.lon);
      if (p.z <= 0.02) return;
      const col = GlobeFallback2D.PIN_COLORS[pt.type] || '#e8edf8';
      const rr = (pt.type === 'lived' || pt.type === 'current') ? 2.9 : 2.2;
      ctx.fillStyle = col;
      ctx.globalAlpha = Math.max(0.22, p.z);
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    const halo = ctx.createRadialGradient(this.cx, this.cy, this.r * 0.86, this.cx, this.cy, this.r * 1.35);
    halo.addColorStop(0, 'rgba(108,99,255,0)');
    halo.addColorStop(1, 'rgba(108,99,255,0.24)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.r * 1.35, 0, Math.PI * 2);
    ctx.fill();
  }

  _animate() {
    if (document.hidden || !this._visible) { this._rafId = null; return; }
    this._rafId = requestAnimationFrame(() => this._animate());
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    if (this._lastDrawTime && (now - this._lastDrawTime) < this._minFrameTime) return;
    this._lastDrawTime = now;
    if (!this._drag) this._rot += this._spin;
    this._draw();
  }
}

