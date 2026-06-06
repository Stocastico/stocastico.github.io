import test from 'node:test';
import assert from 'node:assert/strict';
import { initTheme, resolvedTheme, THEME_STORAGE_KEY } from '../js/ui.js';
import { THEME, THEME_LIGHT } from '../js/theme.js';

/* ── Minimal DOM/BOM doubles ──────────────────────────────────────────────── */

function makeEl(attrs = {}) {
  const listeners = {};
  return {
    attributes: { ...attrs },
    getAttribute(n) { return this.attributes[n] ?? null; },
    setAttribute(n, v) { this.attributes[n] = String(v); },
    addEventListener(type, fn) { listeners[type] = fn; },
    _fire(type, e) { listeners[type] && listeners[type](e); },
  };
}

function setupEnv({ pinned = null, osLight = false } = {}) {
  const html = makeEl(pinned ? { 'data-theme': pinned } : {});
  const meta = makeEl({ name: 'theme-color', content: '#000000' });
  const toggle = makeEl();
  const store = new Map(pinned ? [[THEME_STORAGE_KEY, pinned]] : []);
  const mqListeners = [];

  const mq = {
    matches: osLight,
    addEventListener: (_t, fn) => mqListeners.push(fn),
    _change(matches) { this.matches = matches; mqListeners.forEach(fn => fn()); },
  };

  const dispatched = [];
  global.document = {
    documentElement: html,
    getElementById: (id) => (id === 'theme-toggle' ? toggle : null),
    querySelector: (sel) => (sel === 'meta[name="theme-color"]' ? meta : null),
  };
  global.window = {
    matchMedia: (q) => (/light/.test(q) ? mq : { matches: false, addEventListener() {} }),
    dispatchEvent: (e) => { dispatched.push(e); return true; },
  };
  global.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  };
  global.CustomEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };

  return { html, meta, toggle, store, mq, dispatched };
}

function teardownEnv() {
  delete global.document; delete global.window;
  delete global.localStorage; delete global.CustomEvent;
}

/* ── resolvedTheme ────────────────────────────────────────────────────────── */

test('resolvedTheme: an explicit pin wins over the OS', () => {
  const env = setupEnv({ pinned: 'light', osLight: false });
  try { assert.equal(resolvedTheme(), 'light'); } finally { teardownEnv(); }
});

test('resolvedTheme: with no pin, follows the OS preference', () => {
  setupEnv({ pinned: null, osLight: true });
  try { assert.equal(resolvedTheme(), 'light'); } finally { teardownEnv(); }
  setupEnv({ pinned: null, osLight: false });
  try { assert.equal(resolvedTheme(), 'dark'); } finally { teardownEnv(); }
});

/* ── initTheme: toggle button ─────────────────────────────────────────────── */

test('initTheme: clicking toggles, persists, updates meta + fires themechange', () => {
  const env = setupEnv({ pinned: null, osLight: false }); /* starts dark */
  try {
    initTheme();
    /* initial meta sync to dark */
    assert.equal(env.meta.getAttribute('content'), THEME.themeColor);

    env.toggle._fire('click');
    assert.equal(env.html.getAttribute('data-theme'), 'light', 'pins light');
    assert.equal(env.store.get(THEME_STORAGE_KEY), 'light', 'persists light');
    assert.equal(env.meta.getAttribute('content'), THEME_LIGHT.themeColor, 'meta → light');
    assert.equal(env.dispatched.at(-1).type, 'themechange');
    assert.equal(env.dispatched.at(-1).detail.theme, 'light');

    env.toggle._fire('click');
    assert.equal(env.html.getAttribute('data-theme'), 'dark', 'pins back to dark');
    assert.equal(env.meta.getAttribute('content'), THEME.themeColor);
  } finally { teardownEnv(); }
});

test('initTheme: the toggle label points at the action (next theme)', () => {
  const env = setupEnv({ pinned: 'dark' });
  try {
    initTheme();
    assert.match(env.toggle.getAttribute('aria-label'), /switch to light/i);
    env.toggle._fire('click');
    assert.match(env.toggle.getAttribute('aria-label'), /switch to dark/i);
  } finally { teardownEnv(); }
});

/* ── initTheme: live OS change on an unpinned page ────────────────────────── */

test('initTheme: an unpinned page tracks OS preference changes', () => {
  const env = setupEnv({ pinned: null, osLight: false });
  try {
    initTheme();
    env.dispatched.length = 0;
    env.mq._change(true); /* OS flips to light */
    assert.equal(env.meta.getAttribute('content'), THEME_LIGHT.themeColor);
    assert.equal(env.dispatched.at(-1).detail.theme, 'light');
  } finally { teardownEnv(); }
});

test('initTheme: a pinned page ignores OS preference changes', () => {
  const env = setupEnv({ pinned: 'dark', osLight: false });
  try {
    initTheme();
    env.dispatched.length = 0;
    env.mq._change(true); /* OS flips to light, but user pinned dark */
    assert.equal(env.dispatched.length, 0, 'no themechange while pinned');
    assert.equal(env.meta.getAttribute('content'), THEME.themeColor);
  } finally { teardownEnv(); }
});

test('initTheme: no toggle button present is harmless', () => {
  const env = setupEnv({ pinned: null });
  global.document.getElementById = () => null;
  try { assert.doesNotThrow(() => initTheme()); } finally { teardownEnv(); }
});
