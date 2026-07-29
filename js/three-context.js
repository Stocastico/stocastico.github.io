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
import {
  WebGLRenderer, Scene, PerspectiveCamera,
  AmbientLight, DirectionalLight, PointLight,
  Group, Mesh,
  SphereGeometry, RingGeometry,
  MeshBasicMaterial, LineBasicMaterial, PointsMaterial,
  BufferGeometry, BufferAttribute,
  Points, Line, LineSegments,
  CanvasTexture,
  Vector2, Vector3, QuadraticBezierCurve3,
  Raycaster, Color,
  AdditiveBlending, NormalBlending, BackSide, DoubleSide,
} from 'three';

const _THREE_NPM = {
  WebGLRenderer, Scene, PerspectiveCamera,
  AmbientLight, DirectionalLight, PointLight,
  Group, Mesh,
  SphereGeometry, RingGeometry,
  MeshBasicMaterial, LineBasicMaterial, PointsMaterial,
  BufferGeometry, BufferAttribute,
  Points, Line, LineSegments,
  CanvasTexture,
  Vector2, Vector3, QuadraticBezierCurve3,
  Raycaster, Color,
  AdditiveBlending, NormalBlending, BackSide, DoubleSide,
};

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
