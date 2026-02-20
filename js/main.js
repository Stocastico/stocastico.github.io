/* ============================================================
   PERSONAL WEBSITE — Stefano Masneri
   main.js v1.0
   ============================================================
   HOW TO CUSTOMISE THIS FILE
   ──────────────────────────
   All editable content lives in the DATA object below.
   Edit the arrays/objects in each section and the page will
   automatically update. No HTML edits needed.

   For the blog: add items to DATA.blogPosts following
   the existing shape, or leave the array empty for
   "Coming soon".

   To change the neural-network colours, find the
   NeuralNetwork class and adjust ACCENT_* constants.
   ============================================================ */

'use strict';

/* ─── CONTENT DATA ──────────────────────────────────────────
   Edit anything here to update the page.
   ──────────────────────────────────────────────────────────── */
const DATA = {

  /* Contact cards */
  contact: [
    {
      icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>`,
      label: 'Email',
      value: 'your.email@example.com',          /* ← replace with your email */
      href:  'mailto:your.email@example.com',
    },
    {
      icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 0H5C2.24 0 0 2.24 0 5v14c0 2.76 2.24 5 5 5h14c2.76 0 5-2.24 5-5V5c0-2.76-2.24-5-5-5zM8 19H5V8h3v11zm-1.5-12.27a1.77 1.77 0 1 1 0-3.54 1.77 1.77 0 0 1 0 3.54zM20 19h-3v-5.6c0-3.37-4-3.12-4 0V19h-3V8h3v1.77C14.4 7.22 20 7.03 20 12.41V19z"/></svg>`,
      label: 'LinkedIn',
      value: 'stefanomasneri',
      href:  'https://www.linkedin.com/in/stefanomasneri/',
    },
    {
      icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zm-1 12.99L5 12.4V15l6 3.35L17 15v-2.61l-6 3.6z"/></svg>`,
      label: 'Google Scholar',
      value: 'Stefano Masneri',
      href:  'https://scholar.google.com/citations?user=AvJA648AAAAJ&hl=en',
    },
  ],

  /* Research areas */
  research: [
    {
      icon: '🤖',
      title: 'Artificial Intelligence & Machine Learning',
      desc:  'Designing and deploying ML systems — from classical algorithms to modern foundation models — with a focus on production-ready pipelines and real-world performance.',
    },
    {
      icon: '👁️',
      title: 'Computer Vision & Deep Learning',
      desc:  'Object detection, semantic segmentation, video understanding, and multi-modal perception. Building systems that help machines see and interpret the visual world.',
    },
    {
      icon: '🥽',
      title: 'Augmented Reality for Education',
      desc:  'PhD research on collaborative, multi-user XR experiences that make learning more immersive and effective — from architecture design to large-scale pilots.',
    },
    {
      icon: '🎬',
      title: 'Multi-modal Media Analysis',
      desc:  'Combining audio, video, and text signals for applications such as speaker diarisation, audience engagement measurement, and video lecture segmentation.',
    },
    {
      icon: '📊',
      title: 'Video Understanding',
      desc:  'End-to-end pipelines for lecture and conference video classification, topic visualisation, and automatic annotation of large audiovisual corpora.',
    },
    {
      icon: '🌐',
      title: 'Interactive & Collaborative Systems',
      desc:  'Designing interoperable architectures for multi-user real-time experiences, interactive broadcast/broadband services, and connected media ecosystems.',
    },
  ],

  /* Selected publications — edit or add entries freely */
  publications: [
    {
      year:    '2023',
      title:   'CLEAR: an interoperable architecture for multi-user AR-based school curricula',
      authors: 'S. Masneri et al.',
      venue:   'Virtual Reality',
      url:     'https://scholar.google.com/citations?user=AvJA648AAAAJ&hl=en',
    },
    {
      year:    '2023',
      title:   'Dataset of user interactions across four large pilots on the use of augmented reality in learning experiences',
      authors: 'S. Masneri et al.',
      venue:   'Scientific Data (Nature)',
      url:     'https://www.nature.com/articles/s41597-023-02743-6',
    },
    {
      year:    '2023',
      title:   'Collaborative AR experience for broadcast-broadband convergence (IEEE Transactions on Multimedia)',
      authors: 'S. Masneri, M. Sanz-Narrillos, M. Zorrilla et al.',
      venue:   'IEEE Transactions on Multimedia, Vol. 25',
      url:     'https://scholar.google.com/citations?user=AvJA648AAAAJ&hl=en',
    },
    {
      year:    '2022',
      title:   'Collaborative Multi-user Augmented Reality Solutions in the Classroom',
      authors: 'S. Masneri et al.',
      venue:   'International Conference on Immersive Learning',
      url:     'https://link.springer.com/chapter/10.1007/978-3-030-93907-6_106',
    },
    {
      year:    '2021',
      title:   'A Multi-modal Audience Engagement Measurement System',
      authors: 'S. Masneri et al.',
      venue:   'Agents and Artificial Intelligence (Springer)',
      url:     'https://link.springer.com/chapter/10.1007/978-3-030-71158-0_17',
    },
    {
      year:    '2014',
      title:   'SVM-based Video Segmentation and Annotation of Lectures and Conferences',
      authors: 'S. Masneri, O. Schreer',
      venue:   'VISAPP 2014',
      url:     'https://scholar.google.com/citations?user=AvJA648AAAAJ&hl=en',
    },
  ],

  /* Skills — add/remove groups and tags */
  skills: [
    {
      group: 'AI & Machine Learning',
      tags:  ['Deep Learning', 'PyTorch', 'TensorFlow', 'Scikit-learn', 'Transformers', 'LLMs'],
    },
    {
      group: 'Computer Vision',
      tags:  ['OpenCV', 'Object Detection', 'Semantic Segmentation', 'Video Analysis', 'Multi-modal Perception'],
    },
    {
      group: 'Augmented Reality',
      tags:  ['Unity', 'WebXR', 'ARCore/ARKit', 'Multi-user Systems', 'XR Authoring'],
    },
    {
      group: 'Languages & Tools',
      tags:  ['Python', 'JavaScript', 'C++', 'Docker', 'Git', 'Linux', 'REST APIs'],
    },
    {
      group: 'Research',
      tags:  ['Academic Writing', 'Literature Review', 'Data Analysis', 'Project Management', 'Agile'],
    },
    {
      group: 'Media & Broadcast',
      tags:  ['Multi-modal Analysis', 'Speaker Diarisation', 'Broadcast/Broadband Convergence', 'Audience Engagement'],
    },
  ],

  /* Blog posts — add objects here to show posts.
     Leave the array empty to show "Coming soon".
     ─────────────────────────────────────────────
     Shape: {
       title:   "My post title",
       date:    "2024-12-01",       // ISO date string
       excerpt: "Short summary.",
       url:     "blog/my-post.html" // relative or absolute URL
     }
  */
  blogPosts: [
    {
      title:   'Why Multi-user AR Belongs in Every Classroom',
      date:    '2024-11-20',
      excerpt: 'After four large-scale pilots and hundreds of students, here is what we learned about designing collaborative XR experiences that genuinely improve learning outcomes.',
      tag:     'Research',
      readMin: 7,
      url:     '#',
    },
    {
      title:   'Vision Transformers in Production: A Battle-Tested Guide',
      date:    '2024-09-10',
      excerpt: 'ViT models are powerful, but shipping them has real gotchas. Here is how we brought inference time from 800 ms down to 45 ms with quantisation, smart batching, and memory layout.',
      tag:     'Engineering',
      readMin: 9,
      url:     '#',
    },
    {
      title:   'Multi-modal Speaker Diarisation at Broadcast Scale',
      date:    '2024-07-18',
      excerpt: 'Combining audio embeddings, lip-motion detection, and spatial cues to identify six-plus concurrent speakers in a live broadcast feed — and why the hard part is not the model.',
      tag:     'AI',
      readMin: 6,
      url:     '#',
    },
  ],

};

/* ═══════════════════════════════════════════════════════════
   THREE.JS NEURAL NETWORK ANIMATION
   ═══════════════════════════════════════════════════════════ */
class NeuralNetwork {
  /* Tweak these to change the visual */
  static PARTICLE_COUNT      = 120;
  static CONNECTION_DIST     = 170;  /* max distance (px) to draw a line */
  static SPEED               = 0.4;  /* particle drift speed             */
  static MOUSE_RADIUS        = 220;  /* attraction zone around cursor    */
  static MOUSE_STRENGTH      = 0.0008;
  static ACCENT_R = 0.424; static ACCENT_G = 0.392; static ACCENT_B = 1.0;   /* #6c63ff */
  static CYAN_R   = 0.0;   static CYAN_G   = 0.831; static CYAN_B   = 1.0;   /* #00d4ff */

  constructor(canvas) {
    this.canvas   = canvas;
    this.mouse    = { x: 0, y: 0 };
    this.frameId  = null;

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.scene    = new THREE.Scene();
    this.camera   = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    this.camera.position.z = 600;

    this._initParticles();
    this._initLines();
    this._onResize();

    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('mousemove', e => {
      this.mouse.x = e.clientX - window.innerWidth  / 2;
      this.mouse.y = -(e.clientY - window.innerHeight / 2);
    });
    /* Touch support */
    window.addEventListener('touchmove', e => {
      if (!e.touches[0]) return;
      this.mouse.x = e.touches[0].clientX - window.innerWidth  / 2;
      this.mouse.y = -(e.touches[0].clientY - window.innerHeight / 2);
    }, { passive: true });

    this._animate();
  }

  /* Create a soft glow disc texture for each particle */
  _glowTexture() {
    const size = 64;
    const c    = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const cx  = size / 2;
    const g   = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g.addColorStop(0,    'rgba(108, 99, 255, 1)');
    g.addColorStop(0.25, 'rgba(108, 99, 255, 0.7)');
    g.addColorStop(0.6,  'rgba(0,  212, 255, 0.25)');
    g.addColorStop(1,    'rgba(0,    0,   0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }

  _initParticles() {
    const n   = NeuralNetwork.PARTICLE_COUNT;
    const pos = new Float32Array(n * 3);

    this.velocities = [];

    for (let i = 0; i < n; i++) {
      const hw = window.innerWidth  / 2;
      const hh = window.innerHeight / 2;
      pos[i * 3]     = (Math.random() - 0.5) * hw * 2.2;
      pos[i * 3 + 1] = (Math.random() - 0.5) * hh * 2.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 300;

      const speed = NeuralNetwork.SPEED;
      this.velocities.push({
        x: (Math.random() - 0.5) * speed,
        y: (Math.random() - 0.5) * speed,
        z: (Math.random() - 0.5) * speed * 0.3,
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      size:        6,
      map:         this._glowTexture(),
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
      transparent: true,
      opacity:     0.85,
    });

    this.points = new THREE.Points(geo, mat);
    this.scene.add(this.points);
  }

  _initLines() {
    const n       = NeuralNetwork.PARTICLE_COUNT;
    const maxPairs = n * (n - 1) / 2;        /* upper bound */

    this.linePosArr = new Float32Array(maxPairs * 6);
    this.lineColArr = new Float32Array(maxPairs * 6);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.linePosArr, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(this.lineColArr, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      blending:     THREE.AdditiveBlending,
      transparent:  true,
      depthWrite:   false,
    });

    this.lines = new THREE.LineSegments(geo, mat);
    this.scene.add(this.lines);
    this.lineGeo = geo;
  }

  _update() {
    const n    = NeuralNetwork.PARTICLE_COUNT;
    const dist = NeuralNetwork.CONNECTION_DIST;
    const pos  = this.points.geometry.attributes.position.array;
    const hw   = window.innerWidth  / 2;
    const hh   = window.innerHeight / 2;
    const ms   = NeuralNetwork.MOUSE_STRENGTH;
    const mr   = NeuralNetwork.MOUSE_RADIUS;

    /* Move particles */
    for (let i = 0; i < n; i++) {
      const ix = i * 3, iy = ix + 1, iz = ix + 2;

      /* Mouse attraction (gentle pull) */
      const dx = this.mouse.x - pos[ix];
      const dy = this.mouse.y - pos[iy];
      const md = Math.sqrt(dx * dx + dy * dy);
      if (md < mr && md > 0.1) {
        pos[ix] += dx * ms;
        pos[iy] += dy * ms;
      }

      pos[ix] += this.velocities[i].x;
      pos[iy] += this.velocities[i].y;
      pos[iz] += this.velocities[i].z;

      /* Wrap edges */
      if (pos[ix] >  hw * 1.1) pos[ix] = -hw * 1.1;
      if (pos[ix] < -hw * 1.1) pos[ix] =  hw * 1.1;
      if (pos[iy] >  hh * 1.1) pos[iy] = -hh * 1.1;
      if (pos[iy] < -hh * 1.1) pos[iy] =  hh * 1.1;
    }
    this.points.geometry.attributes.position.needsUpdate = true;

    /* Build connection line buffer */
    const lp  = this.linePosArr;
    const lc  = this.lineColArr;
    const R1  = NeuralNetwork.ACCENT_R, G1 = NeuralNetwork.ACCENT_G, B1 = NeuralNetwork.ACCENT_B;
    const R2  = NeuralNetwork.CYAN_R,   G2 = NeuralNetwork.CYAN_G,   B2 = NeuralNetwork.CYAN_B;
    let   seg = 0;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ax = pos[i*3], ay = pos[i*3+1], az = pos[i*3+2];
        const bx = pos[j*3], by = pos[j*3+1], bz = pos[j*3+2];
        const d  = Math.sqrt((ax-bx)**2 + (ay-by)**2 + (az-bz)**2);

        if (d < dist) {
          const a = 1 - d / dist;          /* fade with distance */
          const s = seg * 6;

          lp[s]   = ax; lp[s+1] = ay; lp[s+2] = az;
          lp[s+3] = bx; lp[s+4] = by; lp[s+5] = bz;

          /* Gradient from accent → cyan based on position in canvas */
          const t = (i / n);              /* 0‥1 */
          lc[s]   = (R1*(1-t) + R2*t) * a;
          lc[s+1] = (G1*(1-t) + G2*t) * a;
          lc[s+2] = (B1*(1-t) + B2*t) * a;
          lc[s+3] = (R2*(1-t) + R1*t) * a;
          lc[s+4] = (G2*(1-t) + G1*t) * a;
          lc[s+5] = (B2*(1-t) + B1*t) * a;

          seg++;
        }
      }
    }

    this.lineGeo.setDrawRange(0, seg * 2);
    this.lineGeo.attributes.position.needsUpdate = true;
    this.lineGeo.attributes.color.needsUpdate    = true;
  }

  _animate() {
    this.frameId = requestAnimationFrame(() => this._animate());
    this._update();
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  destroy() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
  }
}

/* ═══════════════════════════════════════════════════════════
   GEOCODING  (OpenStreetMap Nominatim — free, no key needed)
   Fills lat/lon for any LOCATIONS entry that omits them.
   Runs once at page load; respects 1-req/sec Nominatim ToS.
   ═══════════════════════════════════════════════════════════ */
async function geocodeLocations(locs) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const API   = 'https://nominatim.openstreetmap.org/search';

  /* Collect every item missing coordinates into a flat list */
  const pending = [];
  const collect = (obj) => { if (obj.lat == null || obj.lon == null) pending.push(obj); };
  (locs.pins    || []).forEach(collect);
  (locs.regions || []).forEach(collect);
  (locs.trips   || []).forEach(t => (t.cities || []).forEach(collect));

  if (!pending.length) return;   /* nothing to do — all coords already provided */

  for (let i = 0; i < pending.length; i++) {
    if (i > 0) await sleep(1100);   /* max 1 req/sec — Nominatim ToS */
    const item = pending[i];
    try {
      const url  = `${API}?q=${encodeURIComponent(item.name)}&format=json&limit=1`;
      const res  = await fetch(url);
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

/* ═══════════════════════════════════════════════════════════
   GLOBE 3D — interactive world map in the About section
   Location data lives in  data/locations.js  (edit that file).
   ═══════════════════════════════════════════════════════════ */
class Globe3D {

  /* Two-colour scheme:
       cyan  (#00d4ff) — lived + work  (places you belong to)
       coral (#ff8c42) — travel + trips + regions  (places you explored)
     Visual weight still differentiates lived (large, pulsing) from
     work (small, static) even though they share a colour. */
  static PIN_COLORS = { lived: 0x00d4ff, work: 0x00d4ff, travel: 0xff8c42 };

  static TT_LABEL = { lived: '● Home', work: '◆ Work', travel: '✦ Travel', region: '◉ Region', trip: '➜ Trip stop' };
  static TT_COLOR = { lived: '#00d4ff', work: '#00d4ff', travel: '#ff8c42', region: '#ff8c42', trip: '#e8edf8' };

  constructor(canvasEl) {
    if (!canvasEl || typeof THREE === 'undefined') return;
    if (typeof LOCATIONS === 'undefined') {
      console.warn('Globe3D: data/locations.js not loaded — globe will not render.');
      return;
    }

    this.canvas         = canvasEl;
    this.parent         = canvasEl.parentElement;
    this.tooltip        = document.getElementById('globe-tooltip');
    this.raycaster      = new THREE.Raycaster();
    this.mouse          = new THREE.Vector2(-9, -9);
    this._mpos          = { x: 0, y: 0 };
    this.pulseRings     = [];
    this.markerMeshes   = [];
    this.tripAnimations = [];
    this.isDragging     = false;
    this.prevMouse      = { x: 0, y: 0 };
    this.rotX           =  0.25;
    this.rotY           = -1.6;   /* initial view: Europe faces camera */
    this.velX           = 0;
    this.velY           = 0;

    this._resize();
    this._initScene();
    this._buildGlobe();
    this._buildAtmosphere();
    this._buildGrid();
    this._buildRegions();   /* discs first so pins sit on top */
    this._buildMarkers();
    this._buildTrips();
    this._bindEvents();
    this._animate();
  }

  /* ── Internals ──────────────────────────────────────────── */

  _resize() {
    this.w = this.parent.clientWidth  || 800;
    this.h = this.parent.clientHeight || 500;
  }

  _initScene() {
    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, this.w / this.h, 0.01, 100);
    this.camera.position.z = 2.75;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(this.w, this.h);
    this.renderer.setClearColor(0x000000, 0);

    this.scene.add(new THREE.AmbientLight(0x334466, 1.2));
    const sun = new THREE.DirectionalLight(0xaabbff, 1.4);
    sun.position.set(4, 3, 3);
    this.scene.add(sun);
    const rim = new THREE.PointLight(0x00d4ff, 0.6, 12);
    rim.position.set(-4, 1, -2);
    this.scene.add(rim);

    this.pivot = new THREE.Group();
    this.pivot.rotation.x = this.rotX;
    this.pivot.rotation.y = this.rotY;
    this.scene.add(this.pivot);
  }

  _buildGlobe() {
    this.pivot.add(new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 64),
      new THREE.MeshPhongMaterial({ color: 0x0a1628, emissive: 0x050c1a, specular: 0x1a3366, shininess: 22 }),
    ));
  }

  _buildAtmosphere() {
    /* Inner surface glow */
    this.pivot.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.007, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x1a3a7a, transparent: true, opacity: 0.10, depthWrite: false }),
    ));
    /* Atmosphere shell */
    this.pivot.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.14, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x3355bb, transparent: true, opacity: 0.08, side: THREE.BackSide, depthWrite: false }),
    ));
    /* Wide outer halo — fixed in world space */
    this.scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.24, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x6c63ff, transparent: true, opacity: 0.028, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    ));
  }

  _buildGrid() {
    const mat = (op) => new THREE.LineBasicMaterial({ color: 0x1e3d7a, transparent: true, opacity: op });
    const R   = 1.002;
    for (let lat = -80; lat <= 80; lat += 20) {
      const phi = (90 - lat) * Math.PI / 180;
      const r = R * Math.sin(phi), y = R * Math.cos(phi), pts = [];
      for (let i = 0; i <= 64; i++) { const t = (i / 64) * Math.PI * 2; pts.push(new THREE.Vector3(r * Math.cos(t), y, r * Math.sin(t))); }
      this.pivot.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat(0.45)));
    }
    for (let lon = 0; lon < 360; lon += 20) {
      const theta = lon * Math.PI / 180, pts = [];
      for (let i = 0; i <= 64; i++) { const p = (i / 64) * Math.PI; pts.push(new THREE.Vector3(R * Math.sin(p) * Math.cos(theta), R * Math.cos(p), R * Math.sin(p) * Math.sin(theta))); }
      this.pivot.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat(0.45)));
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

  /* ── Region discs (islands, countries) ─────────────────── */
  _buildRegions() {
    (LOCATIONS.regions || []).filter(reg => !reg._skip).forEach(reg => {
      const color = new THREE.Color(reg.color || '#ff8c42');
      const pos   = this._ll(reg.lat, reg.lon, 1.003);
      /* radius: degrees of arc → 3D chord length on unit sphere */
      const R     = Math.sin((reg.radius * Math.PI) / 180);

      /* Filled translucent disc */
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(R, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.20, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      disc.position.copy(pos);
      this._faceOut(disc, pos);
      this.pivot.add(disc);

      /* Crisp outline ring */
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(R * 0.88, R, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.position.copy(pos);
      this._faceOut(ring, pos);
      this.pivot.add(ring);

      /* Tiny centre dot — holds tooltip userData */
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.008, 8, 8),
        new THREE.MeshBasicMaterial({ color }),
      );
      dot.position.copy(pos);
      dot.userData = { name: reg.name, info: reg.info || 'Region', type: 'region' };
      this.pivot.add(dot);
      this.markerMeshes.push(dot);
    });
  }

  /* ── Standard pins (lived / work / travel) ──────────────── */
  _buildMarkers() {
    (LOCATIONS.pins || []).filter(loc => !loc._skip).forEach(loc => {
      const hex    = Globe3D.PIN_COLORS[loc.type] || 0xffffff;
      const color  = new THREE.Color(hex);
      const pos    = this._ll(loc.lat, loc.lon, 1.008);
      const isHome = (loc.type === 'lived');   /* bigger, pulsing — "I live/lived here" */

      /* Dot — lived pins are larger and more prominent */
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(isHome ? 0.016 : 0.011, 10, 10),
        new THREE.MeshBasicMaterial({ color }),
      );
      dot.position.copy(pos);
      dot.userData = { name: loc.name, info: loc.info, type: loc.type };
      this.pivot.add(dot);
      this.markerMeshes.push(dot);

      /* Static halo — thicker for lived, thinner for work/travel */
      const [rIn, rOut, op] = isHome ? [0.022, 0.028, 0.6] : [0.015, 0.019, 0.35];
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(rIn, rOut, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }),
      );
      halo.position.copy(pos);
      this._faceOut(halo, pos);
      this.pivot.add(halo);

      /* Animated pulse ring — only for lived pins */
      if (isHome) {
        const pulse = new THREE.Mesh(
          new THREE.RingGeometry(0.014, 0.019, 40),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        pulse.position.copy(pos);
        this._faceOut(pulse, pos);
        pulse.userData = { phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 0.35 };
        this.pivot.add(pulse);
        this.pulseRings.push(pulse);
      }
    });
  }

  /* ── Trip paths with animated traveller dot ─────────────── */
  _buildTrips() {
    (LOCATIONS.trips || []).forEach(trip => {
      const color    = new THREE.Color(trip.color || '#ff8c42');   /* coral default */
      const cities   = (trip.cities || []).filter(c => !c._skip);  /* drop geocoding failures */
      if (cities.length < 2) return;

      const curves  = [];
      const segLens = [];
      let   total   = 0;

      for (let i = 0; i < cities.length - 1; i++) {
        const s   = this._ll(cities[i].lat,     cities[i].lon,     1.006);
        const e   = this._ll(cities[i + 1].lat, cities[i + 1].lon, 1.006);
        /* Raise the midpoint above the surface for a visible arc */
        const mid = s.clone().add(e).normalize().multiplyScalar(1.30);
        const curve = new THREE.QuadraticBezierCurve3(s, mid, e);
        curves.push(curve);
        const len = curve.getLength();
        segLens.push(len);
        total += len;

        const pts = curve.getPoints(64);
        const geo = new THREE.BufferGeometry().setFromPoints(pts);

        /* Soft outer glow line */
        this.pivot.add(new THREE.Line(geo,
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }),
        ));
        /* Bright core line */
        this.pivot.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false }),
        ));
      }

      /* City stop dots along the route */
      const seen = new Set();
      cities.forEach(city => {
        const key = `${city.lat},${city.lon}`;
        if (seen.has(key)) return;
        seen.add(key);
        const cpos = this._ll(city.lat, city.lon, 1.010);
        const cdot = new THREE.Mesh(
          new THREE.SphereGeometry(0.010, 8, 8),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
        );
        cdot.position.copy(cpos);
        cdot.userData = { name: city.name, info: trip.name, type: 'trip' };
        this.pivot.add(cdot);
        this.markerMeshes.push(cdot);
      });

      /* Animated traveller dot */
      const traveller = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 10, 10),
        new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending }),
      );
      this.pivot.add(traveller);

      this.tripAnimations.push({
        curves,
        segLens,
        total,
        particle:  traveller,
        cycleSec:  trip.cycleSec || 28,
        offset:    Math.random(),          /* random start so trips don't all sync */
      });
    });
  }

  /* ── Events ─────────────────────────────────────────────── */
  _bindEvents() {
    const cv    = this.canvas;
    const start = (x, y) => { this.isDragging = true; this.prevMouse = { x, y }; this.velX = this.velY = 0; };
    const move  = (x, y) => {
      if (this.isDragging) {
        const dx = x - this.prevMouse.x, dy = y - this.prevMouse.y;
        this.velX  = dy * 0.005; this.velY = dx * 0.005;
        this.rotX  = Math.max(-1.2, Math.min(1.2, this.rotX + dy * 0.005));
        this.rotY += dx * 0.005;
        this.prevMouse = { x, y };
      }
      const rect   = cv.getBoundingClientRect();
      this._mpos   = { x: x - rect.left, y: y - rect.top };
      this.mouse.x = ((x - rect.left) / rect.width)  *  2 - 1;
      this.mouse.y = ((y - rect.top)  / rect.height) * -2 + 1;
    };
    const end = () => { this.isDragging = false; };

    cv.addEventListener('mousedown',     e => start(e.clientX, e.clientY));
    window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
    window.addEventListener('mouseup',   end);
    cv.addEventListener('touchstart',    e => start(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    cv.addEventListener('touchmove',     e => { e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
    cv.addEventListener('touchend',      end);
    window.addEventListener('resize', () => {
      this._resize();
      this.camera.aspect = this.w / this.h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.w, this.h);
    });
  }

  /* ── Render loop ────────────────────────────────────────── */
  _animate() {
    requestAnimationFrame(() => this._animate());

    const t = performance.now() * 0.001;   /* seconds */

    /* Globe rotation — inertia + gentle auto-spin */
    if (!this.isDragging) {
      this.velX *= 0.93;
      this.velY  = Math.abs(this.velY) < 0.0002 ? 0.0014 : this.velY * 0.93;
      this.rotX  = Math.max(-1.2, Math.min(1.2, this.rotX + this.velX));
      this.rotY += this.velY;
    }
    this.pivot.rotation.x = this.rotX;
    this.pivot.rotation.y = this.rotY;

    /* Pulse rings on standard pins */
    this.pulseRings.forEach(ring => {
      const norm = ((t * ring.userData.speed + ring.userData.phase) % (Math.PI * 2)) / (Math.PI * 2);
      ring.scale.set(1 + norm * 2.6, 1 + norm * 2.6, 1);
      ring.material.opacity = (1 - norm) * 0.6;
    });

    /* Animated trip travellers — time-based, constant apparent speed */
    this.tripAnimations.forEach(anim => {
      const globalT = ((t / anim.cycleSec) + anim.offset) % 1;
      let remaining = globalT * anim.total;
      let ci = anim.segLens.length - 1, localT = 1;
      for (let i = 0; i < anim.segLens.length; i++) {
        if (remaining <= anim.segLens[i] + 1e-6) { ci = i; localT = remaining / Math.max(anim.segLens[i], 1e-6); break; }
        remaining -= anim.segLens[i];
      }
      anim.particle.position.copy(anim.curves[ci].getPoint(Math.min(localT, 1)));
      /* Gentle brightness pulse so the traveller "breathes" */
      anim.particle.material.opacity = 0.65 + 0.35 * Math.sin(t * 4 + anim.offset * 20);
    });

    /* Hover raycasting */
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.markerMeshes);
    if (hits.length > 0) {
      const { name, info, type } = hits[0].object.userData;
      if (this.tooltip) {
        this.tooltip.querySelector('.gt-type').textContent = Globe3D.TT_LABEL[type] || type;
        this.tooltip.querySelector('.gt-type').style.color = Globe3D.TT_COLOR[type] || '#e8edf8';
        this.tooltip.querySelector('.gt-name').textContent = name;
        this.tooltip.querySelector('.gt-info').textContent = info;
        let tx = this._mpos.x + 18, ty = this._mpos.y - 14;
        if (tx + 220 > this.w) tx = this._mpos.x - 228;
        if (ty + 90  > this.h) ty = this._mpos.y - 96;
        if (ty < 4) ty = 4;
        this.tooltip.style.left = tx + 'px';
        this.tooltip.style.top  = ty + 'px';
        this.tooltip.classList.add('visible');
      }
    } else if (this.tooltip) {
      this.tooltip.classList.remove('visible');
    }

    this.renderer.render(this.scene, this.camera);
  }
}

/* ═══════════════════════════════════════════════════════════
   SCROLL-TRIGGERED REVEAL
   ═══════════════════════════════════════════════════════════ */
function initScrollReveal() {
  const targets = document.querySelectorAll('[data-animate]');
  if (!targets.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el    = entry.target;
      const delay = parseInt(el.dataset.delay || '0', 10);
      setTimeout(() => el.classList.add('visible'), delay);
      observer.unobserve(el);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

  targets.forEach(el => observer.observe(el));
}

/* ═══════════════════════════════════════════════════════════
   ANIMATED STAT COUNTERS
   ═══════════════════════════════════════════════════════════ */
function initCounters() {
  const counters = document.querySelectorAll('.stat-number[data-count]');
  if (!counters.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el  = entry.target;
      const end = parseInt(el.dataset.count, 10);
      animateCounter(el, end);
      observer.unobserve(el);
    });
  }, { threshold: 0.6 });

  counters.forEach(el => observer.observe(el));
}

function animateCounter(el, target) {
  const duration = 1800;
  const start    = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    /* Ease-out cubic */
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(eased * target);
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/* ═══════════════════════════════════════════════════════════
   NAVBAR SCROLL BEHAVIOUR
   ═══════════════════════════════════════════════════════════ */
function initNavbar() {
  const nav = document.getElementById('navbar');
  if (!nav) return;

  let last = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    nav.classList.toggle('scrolled', y > 20);
    last = y;
  }, { passive: true });
}

/* ═══════════════════════════════════════════════════════════
   MOBILE MENU TOGGLE
   ═══════════════════════════════════════════════════════════ */
function initMobileMenu() {
  const toggle = document.getElementById('nav-toggle');
  const links  = document.getElementById('nav-links');
  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    const open = toggle.classList.toggle('open');
    links.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open);
  });

  /* Close on link click */
  links.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      toggle.classList.remove('open');
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', false);
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   CONTENT INJECTION HELPERS
   ═══════════════════════════════════════════════════════════ */

/* Research cards */
function renderResearch() {
  const grid = document.getElementById('research-grid');
  if (!grid) return;

  grid.innerHTML = DATA.research.map((item, i) => `
    <div class="research-card" role="listitem" data-animate data-delay="${i * 80}">
      <span class="card-icon" aria-hidden="true">${item.icon}</span>
      <h3 class="card-title">${item.title}</h3>
      <p class="card-desc">${item.desc}</p>
    </div>
  `).join('');
}

/* Publication items */
function renderPublications() {
  const list = document.getElementById('publications-list');
  if (!list) return;

  list.innerHTML = DATA.publications.map((pub, i) => `
    <div class="pub-item" role="listitem" data-animate data-delay="${i * 70}">
      <div class="pub-year">${pub.year}</div>
      <div>
        <div class="pub-title">${pub.title}</div>
        <div class="pub-meta">
          ${pub.authors} &nbsp;·&nbsp;
          <span class="pub-venue">${pub.venue}</span>
        </div>
        ${pub.url ? `<a href="${pub.url}" target="_blank" rel="noopener" class="pub-link">Read paper</a>` : ''}
      </div>
    </div>
  `).join('');
}

/* Skills groups */
function renderSkills() {
  const grid = document.getElementById('skills-grid');
  if (!grid) return;

  grid.innerHTML = DATA.skills.map((group, i) => `
    <div class="skill-group" data-animate data-delay="${i * 70}">
      <div class="skill-group-title">${group.group}</div>
      <div class="skill-tags">
        ${group.tags.map(t => `<span class="skill-tag">${t}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

/* Blog posts (or coming-soon placeholder) */
function renderBlog() {
  const grid = document.getElementById('blog-grid');
  if (!grid) return;

  if (!DATA.blogPosts.length) {
    grid.innerHTML = `
      <div class="blog-coming-soon" data-animate>
        Coming soon — stay tuned for thoughts on AI, XR, and beyond.
      </div>
    `;
    return;
  }

  grid.innerHTML = DATA.blogPosts.map((post, i) => {
    const date    = new Date(post.date).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    const tagSlug = (post.tag || 'general').toLowerCase().replace(/\s+/g, '-');
    const readStr = post.readMin ? `${post.readMin} min →` : 'Read →';
    return `
      <a href="${post.url}" class="blog-card" data-animate data-delay="${i * 80}">
        <div class="blog-card-accent blog-accent-${tagSlug}"></div>
        <div class="blog-card-body">
          <span class="blog-tag">${post.tag || 'Post'}</span>
          <span class="blog-title">${post.title}</span>
          <span class="blog-excerpt">${post.excerpt}</span>
        </div>
        <div class="blog-card-foot">
          <span class="blog-date">${date}</span>
          <span class="blog-read">${readStr}</span>
        </div>
      </a>
    `;
  }).join('');
}

/* Contact cards */
function renderContact() {
  const grid = document.getElementById('contact-grid');
  if (!grid) return;

  grid.innerHTML = DATA.contact.map((item, i) => `
    <a href="${item.href}" target="_blank" rel="noopener"
       class="contact-card" data-animate data-delay="${i * 100}">
      <div class="contact-icon">${item.icon}</div>
      <div class="contact-info">
        <span class="contact-label">${item.label}</span>
        <span class="contact-value">${item.value}</span>
      </div>
    </a>
  `).join('');
}

/* Footer year */
function setFooterYear() {
  const el = document.getElementById('footer-year');
  if (el) el.textContent = new Date().getFullYear();
}

/* ═══════════════════════════════════════════════════════════
   INIT — runs when DOM is ready
   ═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  /* Inject content */
  renderResearch();
  renderPublications();
  renderSkills();
  renderBlog();
  renderContact();
  setFooterYear();

  /* UI behaviours */
  initNavbar();
  initMobileMenu();

  /* Scroll reveals (must come after content injection) */
  initScrollReveal();
  initCounters();

  /* Three.js neural network — only when THREE is loaded */
  const canvas = document.getElementById('neural-canvas');
  if (canvas && typeof THREE !== 'undefined') {
    /* Disable on reduced-motion preference */
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReducedMotion) {
      new NeuralNetwork(canvas);
    } else {
      canvas.style.display = 'none';
    }
  }

  /* Three.js Globe — geocode any entries missing lat/lon, then build */
  const globeCanvas = document.getElementById('globe-canvas');
  if (globeCanvas && typeof THREE !== 'undefined' && typeof LOCATIONS !== 'undefined') {
    geocodeLocations(LOCATIONS).then(() => new Globe3D(globeCanvas));
  }

});
