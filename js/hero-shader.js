/* ═══════════════════════════════════════════════════════════
   HERO NAME SHADER

   Renders "Stefano / Masneri" with iridescent chromatic
   aberration on a WebGL canvas overlay.  Falls back to the
   CSS-styled <h1> if WebGL is unavailable.

   Pure raw WebGL — does NOT depend on Three.js.
   ═══════════════════════════════════════════════════════════ */
import { isLowPowerDevice } from './utils.js';
import { THEME, glvec } from './theme.js';

/* '#rrggbb' → GLSL `vec3(r, g, b)` literal. */
const v3 = (hex) => `vec3(${glvec(hex).join(', ')})`;

export class HeroNameShader {

  constructor(h1El, canvasEl) {
    this.h1 = h1El;
    this.canvas = canvasEl;
    this.mx = 0.5;   /* normalised mouse x */
    this.my = 0.5;   /* normalised mouse y */
    this.t = 0;
    this.raf = null;
    this._visible = true;
    this._io = null;
    this._isLowPower = isLowPowerDevice();
    this._pixelRatioCap = this._isLowPower ? 1.25 : 1.5;
    this._targetFps = this._isLowPower ? 20 : 30;
    this._minFrameTime = 1 / this._targetFps;
    this._lastDrawTime = 0;

    const gl = canvasEl.getContext('webgl', { alpha: true, premultipliedAlpha: false })
      || canvasEl.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) { console.warn('[HeroName] WebGL unavailable — CSS fallback active'); return; }
    this.gl = gl;
    if (typeof this.canvas.addEventListener === 'function') {
      this.canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.raf = null;
      }, false);
      this.canvas.addEventListener('webglcontextrestored', () => {
        if (!this._setupGL()) return;
        this._resize();
        if (!this.raf && !document.hidden && this._visible) this._animate();
      }, false);
    }

    /* Wait for web-fonts before measuring / drawing text */
    const boot = () => {
      if (this._setupGL()) {
        this._resize();
        this._bindEvents();
        this._animate();
        h1El.classList.add('hero-name--gpu');  /* hide original text */
        this._io = new IntersectionObserver(([entry]) => {
          this._visible = entry.isIntersecting;
          if (this._visible && !document.hidden && !this.raf) this._animate();
        }, { threshold: 0 });
        this._io.observe(this.canvas);
      }
    };
    if (document.fonts?.ready) document.fonts.ready.then(boot);
    else setTimeout(boot, 400);   /* Safari guard */
  }

  /* ── GLSL compilation helper ── */
  _compile(type, src) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[HeroName shader]', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  /* ── Compile shaders, upload quad, locate uniforms ── */
  _setupGL() {
    const gl = this.gl;

    /* passthrough vertex shader */
    const VS = `
      attribute vec2 aPos;
      varying   vec2 vUv;
      void main() {
        vUv         = aPos * 0.5 + 0.5;
        vUv.y       = 1.0 - vUv.y;
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `;

    /* iridescent chromatic-aberration fragment shader */
    const FS = `
      precision highp float;
      uniform sampler2D uTex;
      uniform float     uTime;
      uniform vec2      uMouse;
      uniform vec2      uRes;
      varying vec2      vUv;

      /* --- value noise --- */
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i),            hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }
      float fbm(vec2 p) {
        return noise(p)       * 0.500
             + noise(p * 2.1 + vec2(3.7, 1.3)) * 0.250
             + noise(p * 4.3 + vec2(7.8, 5.2)) * 0.125;
      }

      void main() {
        float asp = uRes.x / uRes.y;
        vec2  uv  = vUv;

        /* animated organic flow */
        float f1 = fbm(vec2(uv.x * asp * 2.2, uv.y * 2.2)
                       + vec2(uTime * 0.11, uTime * 0.07));
        float f2 = fbm(vec2(uv.x * asp * 2.2 + 4.3, uv.y * 2.2 + 3.1)
                       + vec2(uTime * 0.08, uTime * 0.14));
        vec2 disp = vec2(f1 - 0.5, f2 - 0.5) * 0.005;

        /* mouse repulsion / warping */
        vec2  toM = (uMouse - uv) * vec2(asp, 1.0);
        float md  = length(toM);
        disp     -= (toM / (md * md + 0.06)) * 0.004;

        /* chromatic aberration — 3 wavelengths offset horizontally.
           Subtle enough to keep letterforms crisp. */
        float ab = 0.0012;
        float aR = texture2D(uTex, clamp(uv + disp + vec2( ab, 0.0), 0.0, 1.0)).a;
        float aG = texture2D(uTex, clamp(uv + disp,                  0.0, 1.0)).a;
        float aB = texture2D(uTex, clamp(uv + disp - vec2( ab, 0.0), 0.0, 1.0)).a;

        if (max(max(aR, aG), aB) < 0.004) discard;

        /* stable dark-theme palette — accent -> accent2, no rainbow cycling.
           Colours injected from data/palettes.yaml via js/theme.js. */
        float sweep = uv.x * 1.2 + uv.y * 0.55 + uTime * 0.04 + md * 0.25;
        vec3 baseA = ${v3(THEME.accent)};
        vec3 baseB = ${v3(THEME.accent2)};
        vec3 baseC = ${v3(THEME.heroGradFrom)};
        vec3 iri = mix(baseA, baseB, clamp(sweep, 0.0, 1.0));
        iri = mix(iri, baseC, 0.18 + 0.10 * sin(uTime * 0.25));

        /* combine per-channel alpha with iridescent colour */
        vec3  col   = vec3(aR, aG, aB) * iri;
        float alpha = max(max(aR, aG), aB);
        gl_FragColor = vec4(col, alpha);
      }
    `;

    const vs = this._compile(gl.VERTEX_SHADER, VS);
    const fs = this._compile(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return false;

    this.prog = gl.createProgram();
    gl.attachShader(this.prog, vs);
    gl.attachShader(this.prog, fs);
    gl.linkProgram(this.prog);
    if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) {
      console.error('[HeroName link]', gl.getProgramInfoLog(this.prog));
      return false;
    }
    gl.useProgram(this.prog);

    /* full-screen quad */
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(this.prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.uTime = gl.getUniformLocation(this.prog, 'uTime');
    this.uMouse = gl.getUniformLocation(this.prog, 'uMouse');
    this.uRes = gl.getUniformLocation(this.prog, 'uRes');
    gl.uniform1i(gl.getUniformLocation(this.prog, 'uTex'), 0);

    /* text texture (filled by _drawText) */
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    /* alpha blending for transparent canvas */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    /* single offscreen 2-D canvas — reused every _drawText() call */
    this._textCanvas = document.createElement('canvas');

    return true;
  }

  /* ── Render name text to an offscreen 2D canvas, upload as GL texture ── */
  _drawText() {
    const gl = this.gl;
    const dpr = Math.min(devicePixelRatio || 1, this._pixelRatioCap);
    const w = this.canvas.offsetWidth || 400;
    const h = this.canvas.offsetHeight || 200;

    const tc = this._textCanvas;        /* reuse — no GC churn */
    tc.width = Math.round(w * dpr);
    tc.height = Math.round(h * dpr);
    const ctx = tc.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    /* read the live font-size + line-height from the h1 (respects clamp() / viewport) */
    const styles = getComputedStyle(this.h1);
    const fs = parseFloat(styles.fontSize);
    const lh = parseFloat(styles.lineHeight) || fs;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    /* Line 1 & 2: Outfit Bold — clean geometric sans-serif */
    ctx.font = `700 ${fs}px 'Outfit', 'Inter', system-ui, sans-serif`;
    ctx.fillText('Stefano', 0, 0);
    ctx.fillText('Masneri', 0, lh);

    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tc);
  }

  /* ── Sync canvas size with h1 dimensions ── */
  _resize() {
    const gl = this.gl;
    const dpr = Math.min(devicePixelRatio || 1, this._pixelRatioCap);
    const fallbackW = this.h1.offsetWidth || 400;
    const h = this.h1.offsetHeight || 200;
    const fs = parseFloat(getComputedStyle(this.h1).fontSize) || 64;
    if (!this._measureCanvas) this._measureCanvas = document.createElement('canvas');
    const measureCtx = this._measureCanvas.getContext('2d');
    let textW = fallbackW;
    if (measureCtx && typeof measureCtx.measureText === 'function') {
      measureCtx.font = `700 ${fs}px 'Outfit', 'Inter', system-ui, sans-serif`;
      const l1 = measureCtx.measureText('Stefano').width;
      const l2 = measureCtx.measureText('Masneri').width;
      textW = Math.max(fallbackW, l1, l2) + fs * 0.28;
    }
    const w = Math.round(textW);

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.uRes, this.canvas.width, this.canvas.height);
    this._drawText();
  }

  _bindEvents() {
    window.addEventListener('mousemove', e => {
      if (!this._visible) return;
      const r = this.canvas.getBoundingClientRect();
      this.mx = (e.clientX - r.left) / (r.width || 1);
      this.my = (e.clientY - r.top) / (r.height || 1);
    });
    window.addEventListener('touchmove', e => {
      if (!this._visible) return;
      if (!e.touches[0]) return;
      const r = this.canvas.getBoundingClientRect();
      this.mx = (e.touches[0].clientX - r.left) / (r.width || 1);
      this.my = (e.touches[0].clientY - r.top) / (r.height || 1);
    }, { passive: true });
    /* debounce resize — avoids GL texture churn while the user drags the window */
    let _rszTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(_rszTimer);
      _rszTimer = setTimeout(() => this._resize(), 150);
    });

    /* pause RAF when the browser tab is hidden */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this._visible && !this.raf) this._animate();
    });
  }

  _animate() {
    if (document.hidden || !this._visible) { this.raf = null; return; }   /* pause when hidden or off-screen */
    this.raf = requestAnimationFrame(() => this._animate());
    if (!this.gl || !this.prog) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    if (this._lastDrawTime && (now - this._lastDrawTime) < this._minFrameTime) return;
    const dt = this._lastDrawTime ? Math.min(now - this._lastDrawTime, 0.05) : this._minFrameTime;
    this._lastDrawTime = now;
    this.t += dt;
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(this.uTime, this.t);
    gl.uniform2f(this.uMouse, this.mx, this.my);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this._io) this._io.disconnect();
  }
}
