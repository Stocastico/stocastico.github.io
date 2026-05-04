/* ─────────────────────────────────────────────────────────────────────────
   Shared Three.js context.

   Every module that needs THREE imports it from here.  The indirection lets
   tests swap the real `three` package for a minimal mock via
   `__setThreeForTests(mock)` / `__resetThreeForTests()` and have every
   downstream module pick up the new value.

   Pattern in consumer modules:

     import { onChange } from './three-context.js';
     let Scene, WebGLRenderer, ...;
     onChange((t) => {
       ({ Scene, WebGLRenderer, ... } = t);
     });

   Classes can then reference bare `Scene`, `WebGLRenderer`, etc. exactly as
   if they were top-level named imports — including capturing them locally
   before async boundaries.

   The named-imports below are the union of every Three.js symbol referenced
   anywhere in the source tree.  Listing them explicitly (rather than
   `import * as THREE from 'three'`) lets Rollup tree-shake the rest of the
   library out of the production bundle.
   ───────────────────────────────────────────────────────────────────────── */
// Dynamic import so the module loads gracefully when `three` is absent (e.g.
// in test environments without node_modules). Tests inject a mock via
// __setThreeForTests before exercising any Three.js-dependent code paths.
let _THREE_NPM = {};
try {
  const m = await import('three');
  _THREE_NPM = {
    WebGLRenderer:          m.WebGLRenderer,
    Scene:                  m.Scene,
    PerspectiveCamera:      m.PerspectiveCamera,
    AmbientLight:           m.AmbientLight,
    DirectionalLight:       m.DirectionalLight,
    PointLight:             m.PointLight,
    Group:                  m.Group,
    Mesh:                   m.Mesh,
    SphereGeometry:         m.SphereGeometry,
    RingGeometry:           m.RingGeometry,
    MeshBasicMaterial:      m.MeshBasicMaterial,
    LineBasicMaterial:      m.LineBasicMaterial,
    PointsMaterial:         m.PointsMaterial,
    BufferGeometry:         m.BufferGeometry,
    BufferAttribute:        m.BufferAttribute,
    Points:                 m.Points,
    Line:                   m.Line,
    LineSegments:           m.LineSegments,
    CanvasTexture:          m.CanvasTexture,
    Vector2:                m.Vector2,
    Vector3:                m.Vector3,
    QuadraticBezierCurve3:  m.QuadraticBezierCurve3,
    Raycaster:              m.Raycaster,
    Color:                  m.Color,
    AdditiveBlending:       m.AdditiveBlending,
    BackSide:               m.BackSide,
    DoubleSide:             m.DoubleSide,
  };
} catch {
  // three not installed — tests will inject a mock via __setThreeForTests
}

let _current = _THREE_NPM;
const _listeners = [];

export function getTHREE() {
  return _current;
}

/** Register a callback that runs immediately with the current THREE and
 *  again whenever the active THREE is swapped (for test mocking). */
export function onChange(fn) {
  _listeners.push(fn);
  fn(_current);
}

export function __setThreeForTests(mock) {
  _current = mock;
  for (const fn of _listeners) fn(_current);
}

export function __resetThreeForTests() {
  _current = _THREE_NPM;
  for (const fn of _listeners) fn(_current);
}
