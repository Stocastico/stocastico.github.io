/* ─────────────────────────────────────────────────────────────────────────
   Shared Three.js context.

   Every module that needs THREE imports it from here.  The indirection lets
   tests swap the real `three` package for a minimal mock via
   `__setThreeForTests(mock)` / `__resetThreeForTests()` and have every
   downstream module pick up the new value.

   Pattern in consumer modules:

     import { onChange } from './three-context.js';
     let THREE;
     onChange((t) => { THREE = t; });   // sets THREE now and on every swap

   Classes can then reference bare `THREE` exactly as if it were a top-level
   import — including capturing it locally before async boundaries.
   ───────────────────────────────────────────────────────────────────────── */
import * as _THREE_NPM from 'three';

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
