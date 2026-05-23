/* ─── Shared environment helpers ──────────────────────────────
   Used by neural-net, globe, animations, hero-shader, etc.
   Each function is safe to call in Node (returns sensible
   defaults when DOM/browser globals are absent). */

/* Shared TopoJSON cache — avoids double-fetching world-110m.json */
if (typeof window !== 'undefined') {
  window._topoPromise = null;
}

export function getTopoJSON() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (!window._topoPromise) {
    window._topoPromise = fetch('./data/world-110m.json')
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch((err) => {
        /* Don't cache a rejection — let a later call retry the fetch. */
        window._topoPromise = null;
        throw err;
      });
  }
  return window._topoPromise;
}

export function isLowPowerDevice() {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const cores = nav && typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 8;
  const coarsePointer = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const narrowViewport = typeof window !== 'undefined' && window.innerWidth < 760;
  /* Data-saver mode or non-4G connection: skip heavy effects to save bandwidth */
  const savesData   = !!nav?.connection?.saveData;
  const slowNetwork = !!(nav?.connection?.effectiveType
    && nav.connection.effectiveType !== '4g');
  return coarsePointer || narrowViewport || cores <= 4 || savesData || slowNetwork;
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let _webglSupportCache = null;
export function hasWebGLSupport() {
  if (_webglSupportCache != null) return _webglSupportCache;
  if (typeof document === 'undefined') return false;
  const c = document.createElement('canvas');
  _webglSupportCache = !!(
    c.getContext('webgl', { failIfMajorPerformanceCaveat: true })
    || c.getContext('experimental-webgl', { failIfMajorPerformanceCaveat: true })
  );
  return _webglSupportCache;
}

/* Escape a string for safe interpolation into innerHTML. Shared by the
   command-palette UI (js/ui.js) and the content renderers (js/main.js). */
export function escapeHtml(raw) {
  return String(raw ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
