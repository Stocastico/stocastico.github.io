/* ═══════════════════════════════════════════════════════════
   HERO BACKGROUND — GLSL NOISE GRADIENT
   Domain-warped fBm shader: deep dark ↔ mid tone ↔ bright pop.
   Renders a small burst of frames to produce a nice noise
   pattern, then stops — no continuous animation loop.

   Raw WebGL, no Three.js dependency. Colours are injected from
   data/palettes.yaml via js/theme.js — resolved per *instance* with
   getTheme(), so the colours are baked into the shader source (a template
   literal — no uniforms) at construction time. There is no recompile on the
   fly: a theme switch rebuilds the instance (js/main.js), which recompiles the
   shader with the new palette's colours.
   ═══════════════════════════════════════════════════════════ */
import { getTheme, glvec } from './theme.js';

/* '#rrggbb' → GLSL `vec3(r, g, b)` literal. */
const v3 = (hex) => `vec3(${glvec(hex).join(', ')})`;

export class NoiseGradient {
  constructor(canvas) {
    this.canvas = canvas;
    /* Resolve the active palette (dark or light) for this instance — baked
       into the shader source below. */
    this._theme = getTheme();
    /* No preserveDrawingBuffer — nothing reads pixels back, and keeping it on
       forces the browser to retain a second copy of the framebuffer. */
    const gl = canvas.getContext('webgl', { alpha: false, depth: false, stencil: false, antialias: false })
             || canvas.getContext('experimental-webgl', { alpha: false, depth: false });
    if (!gl) { canvas.style.display = 'none'; return; }
    this.gl = gl;
    this._setup();
    this._resize();
    this._startTime = performance.now();
    this._framesLeft = 3; /* render a few frames then stop */
    this._tick      = this._tick.bind(this);
    this._raf       = requestAnimationFrame(this._tick);

    /* Resize handler — debounced. Re-runs the 3-frame burst at the new size,
       otherwise the canvas would stay blank after the user resizes their
       window (changing canvas.width clears the WebGL buffer). The debounce
       avoids spawning a new burst on every pixel of a drag-resize.

       The pending timer is held on `this` rather than in a closure variable
       so destroy() can cancel it. Removing the listener is not enough: a
       resize that lands within 200 ms of a teardown leaves a timeout already
       scheduled, and it fires after destroy() has force-lost the context and
       set this.gl = null — _resize() then dereferences a null gl, and the rAF
       it starts runs _tick() against the same null. Narrow, but the window it
       needs is exactly a theme or palette switch made mid-drag-resize, which
       is a thing people do while trying the palette dots. */
    this._rszTimer = null;
    this._onResizeHandler = () => {
      clearTimeout(this._rszTimer);
      this._rszTimer = setTimeout(() => {
        this._rszTimer = null;
        this._resize();
        this._framesLeft = Math.max(this._framesLeft, 2);
        if (!this._raf) this._raf = requestAnimationFrame(this._tick);
      }, 200);
    };
    window.addEventListener('resize', this._onResizeHandler, { passive: true });
  }

  _compileShader(type, src) {
    const s = this.gl.createShader(type);
    this.gl.shaderSource(s, src);
    this.gl.compileShader(s);
    if (!this.gl.getShaderParameter(s, this.gl.COMPILE_STATUS)) {
      console.error('[NoiseGradient shader]', this.gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  _setup() {
    const gl = this.gl;

    const vert = this._compileShader(gl.VERTEX_SHADER,
      `attribute vec2 a_pos;
       void main(){gl_Position=vec4(a_pos,0.0,1.0);}`);

    /* Domain-warped fBm fragment shader */
    const frag = this._compileShader(gl.FRAGMENT_SHADER,
      `precision mediump float;
       uniform float u_t;
       uniform vec2  u_res;

       float hash(vec2 p){
         p=fract(p*vec2(127.1,311.7));
         p+=dot(p,p+17.5);
         return fract(p.x*p.y);
       }
       float noise(vec2 p){
         vec2 i=floor(p),f=fract(p);
         vec2 u=f*f*(3.0-2.0*f);
         return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
                    mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
       }
       float fbm(vec2 p){
         float v=0.0,a=0.5;
         for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.1+vec2(0.13,-0.07);a*=0.5;}
         return v;
       }
       void main(){
         vec2 uv=gl_FragCoord.xy/u_res;
         uv.y=1.0-uv.y;
         float t=u_t*0.06;
         /* First warp pass */
         vec2 q=vec2(fbm(uv*1.4+t),
                     fbm(uv*1.4+vec2(1.3,1.7)+t));
         /* Second warp pass — creates the folded turbulence */
         vec2 r=vec2(fbm(uv*1.4+2.0*q+vec2(1.7,9.2)+0.15*t),
                     fbm(uv*1.4+2.0*q+vec2(8.3,2.8)+0.126*t));
         float f=fbm(uv*1.4+2.5*r);
         /* Palette: deep dark → mid tone → bright pop.
            Colours injected from data/palettes.yaml via js/theme.js. */
         vec3 col=mix(${v3(this._theme.noise.dark)},
                      ${v3(this._theme.noise.mid)},
                      clamp(f*2.0-0.15,0.0,1.0));
         col=mix(col,
                 ${v3(this._theme.noise.bright)},
                 clamp(f*f*4.0-0.4,0.0,1.0));
         col*=f*1.05+0.08;
         gl_FragColor=vec4(col,1.0);
       }`);

    if (!vert || !frag) { this.canvas.style.display = 'none'; return; }

    this._vert = vert;
    this._frag = frag;
    this.prog = gl.createProgram();
    gl.attachShader(this.prog, vert);
    gl.attachShader(this.prog, frag);
    gl.linkProgram(this.prog);
    if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) {
      console.error('[NoiseGradient link]', gl.getProgramInfoLog(this.prog));
      this.canvas.style.display = 'none';
      return;
    }
    gl.useProgram(this.prog);

    /* Full-screen quad */
    const buf = gl.createBuffer();
    this._buf = buf;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this._uTime = gl.getUniformLocation(this.prog, 'u_t');
    this._uRes  = gl.getUniformLocation(this.prog, 'u_res');
  }

  _resize() {
    /* Intentionally cap at 1× DPR — noise looks great at lower res */
    const scale = Math.min(window.devicePixelRatio || 1, 1.0);
    const w = Math.round(this.canvas.clientWidth  * scale);
    const h = Math.round(this.canvas.clientHeight * scale);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width  = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  }

  _tick(now) {
    if (this._framesLeft <= 0) { this._raf = null; return; }
    this._raf = requestAnimationFrame(this._tick);
    if (document.hidden) return;
    const t = (now - this._startTime) / 1000;
    const { gl } = this;
    gl.uniform1f(this._uTime, t);
    gl.uniform2f(this._uRes, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this._framesLeft--;
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    if (this._rszTimer) { clearTimeout(this._rszTimer); this._rszTimer = null; }
    if (this._onResizeHandler) {
      try { window.removeEventListener('resize', this._onResizeHandler); } catch (_) { /* ignore */ }
      this._onResizeHandler = null;
    }
    const gl = this.gl;
    if (gl) {
      try {
        if (this.prog) gl.deleteProgram(this.prog);
        if (this._vert) gl.deleteShader(this._vert);
        if (this._frag) gl.deleteShader(this._frag);
        if (this._buf) gl.deleteBuffer(this._buf);
      } catch (_) { /* mock / partial context — ignore */ }
      try {
        if (typeof gl.getExtension === 'function') gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch (_) { /* ignore */ }
    }
    this.gl = null;
  }
}
