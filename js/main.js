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
  blogPosts: [],

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
    const date = new Date(post.date).toLocaleDateString('en-GB', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    return `
      <a href="${post.url}" class="blog-card" data-animate data-delay="${i * 80}">
        <span class="blog-date">${date}</span>
        <span class="blog-title">${post.title}</span>
        <span class="blog-excerpt">${post.excerpt}</span>
        <span class="blog-read">Read →</span>
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

});
