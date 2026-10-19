/* ─── Shared environment helpers ──────────────────────────────
   Used by neural-net, globe, animations, etc.
   Each function is safe to call in Node (returns sensible
   defaults when DOM/browser globals are absent). */

/* Shared TopoJSON cache — avoids double-fetching world-110m.json */
if (typeof window !== 'undefined') {
  window._topoPromise = null;
}

export function getTopoJSON() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (!window._topoPromise) {
    /* Root-relative, not './'. The globe lives on travel.html at the root
       today, so the two resolve identically — but a page-relative path silently
       becomes /projects/data/world-110m.json the moment the globe is embedded
       anywhere below the root. The site deploys at the domain root (CNAME), so
       a leading slash is correct here. */
    window._topoPromise = fetch('/data/world-110m.json')
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch((err) => {
        /* Don't cache a rejection — let a later call retry the fetch. */
        window._topoPromise = null;
        throw err;
      });
  }
  return window._topoPromise;
}

/* The travel page's nautical chart frame (#193), in degrees.

   One frame, two readers. scripts/generate-sea-chart.mjs projects it to the
   chart's viewBox, and js/globe.js hides the European worktrips and holidays
   inside it — because the chart draws them, and a globe at that zoom can only
   pile seventy pins on one continent. Sharing the numbers is what guarantees
   no pin falls between the two views. The ratio is ~16:9 in Mercator (35°–60°N
   is 38° of stretched latitude against 68° of longitude), and the frame is
   centred on the route's longitude so a phone's centred crop keeps all of it. */
export const CHART_BOUNDS = { minLon: -28.5, maxLon: 39.5, minLat: 35, maxLat: 60 };

/* A LOCATIONS entry the maps can actually place.

   Replaces the `_skip` flag the old runtime geocoder set on a failed lookup.
   Coordinates are baked in by scripts/generate-locations.js now, so the honest
   question at render time is not "did geocoding fail" but "did the build give
   this one a position" — and an entry without one must be skipped rather than
   projected to NaN.

   Lives here rather than in globe.js so that nothing which only needs this
   check has to import the module that pulls the 540 KB Three.js chunk.
   utils.js has no dependencies, which is why it is the right home. */
export function hasCoords(item) {
  return !!item
    && typeof item.lat === 'number' && Number.isFinite(item.lat)
    && typeof item.lon === 'number' && Number.isFinite(item.lon);
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

/* Coalesce a burst of events (scroll, mousemove, resize) onto one rAF tick:
   the wrapped fn runs once per frame with the most recent arguments. Falls
   back to a synchronous pass-through in Node (no requestAnimationFrame) so
   tests can invoke the captured handler directly. */
export function rafThrottle(fn) {
  let scheduled = false;
  let lastArgs = null;
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb) => { cb(); return 0; };
  return (...args) => {
    lastArgs = args;
    if (scheduled) return;
    scheduled = true;
    raf(() => { scheduled = false; fn(...lastArgs); });
  };
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
