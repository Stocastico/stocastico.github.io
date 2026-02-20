/* ============================================================
   GLOBE LOCATIONS  —  THIS IS THE ONLY FILE YOU NEED TO EDIT
   to update pins, trips and highlighted regions on the globe.
   ============================================================

   THREE PIN TYPES
   ───────────────
   "lived"  → cyan   #00d4ff  — cities you have called home
   "work"   → gold   #ffd060  — work, research, conferences
   "travel" → coral  #ff8c42  — holidays & leisure

   TRIPS
   ─────
   An ordered list of cities connected by animated great-circle
   arcs. A glowing dot travels the route continuously.
   Each trip gets its own colour and a label shown in tooltips.
   "cycleSec" controls how many seconds one full loop takes.

   REGIONS
   ───────
   For small islands, archipelagos, or countries where a single
   pin would be too tiny to see — renders a soft glowing disc
   on the globe surface.
   "radius" is in degrees of arc:
     0.5 ≈ 55 km radius  |  1.0 ≈ 110 km  |  2.0 ≈ 220 km

   HOW TO ADD A NEW PIN
   ─────────────────────
   Copy one of the existing pin lines, change the values, save.
   The globe updates automatically on next page load.

   HOW TO ADD A NEW TRIP
   ──────────────────────
   Add a new object to the trips array with:
     name, color, cycleSec (optional, default 28), cities []
   Cities are connected in array order. Duplicate the first city
   at the end to make the route loop back.

   HOW TO ADD A NEW REGION
   ────────────────────────
   Add a new object to the regions array with:
     name, lat, lon, radius, color, info
   ============================================================ */

/* global LOCATIONS */
const LOCATIONS = {

  /* ── Pins ──────────────────────────────────────────────────
     Required fields: type, name, lat, lon, info
     ────────────────────────────────────────────────────────── */
  pins: [

    // ─ Lived (cyan) ─────────────────────────────────────────
    { type: 'lived',  name: 'Crema, Italy',          lat:  45.36, lon:   9.68, info: 'Home town' },
    { type: 'lived',  name: 'San Sebastián, Spain',  lat:  43.32, lon:  -1.98, info: 'Current home' },

    // ─ Work & research (gold) ────────────────────────────────
    { type: 'work',   name: 'Bilbao, Spain',          lat:  43.26, lon:  -2.93, info: 'Vicomtech Foundation' },
    { type: 'work',   name: 'Barcelona, Spain',       lat:  41.38, lon:   2.17, info: 'GRUP MEDIAPRO HQ' },
    { type: 'work',   name: 'Madrid, Spain',          lat:  40.42, lon:  -3.70, info: 'Conferences' },
    { type: 'work',   name: 'Berlin, Germany',        lat:  52.52, lon:  13.40, info: 'Fraunhofer HHI' },
    { type: 'work',   name: 'Amsterdam, Netherlands', lat:  52.37, lon:   4.90, info: 'IBC Show' },
    { type: 'work',   name: 'London, UK',             lat:  51.50, lon:  -0.12, info: 'Research visits' },
    { type: 'work',   name: 'Milan, Italy',           lat:  45.46, lon:   9.19, info: 'Conferences' },
    { type: 'work',   name: 'New York, USA',          lat:  40.71, lon: -74.01, info: 'Research conference' },
    { type: 'work',   name: 'Tokyo, Japan',           lat:  35.68, lon: 139.69, info: 'Research visit' },

    // ─ Travel / holidays (coral) ─────────────────────────────
    { type: 'travel', name: 'Paris, France',          lat:  48.86, lon:   2.35, info: 'Holiday' },
    { type: 'travel', name: 'Prague, Czechia',        lat:  50.07, lon:  14.43, info: 'Holiday' },
    { type: 'travel', name: 'Lisbon, Portugal',       lat:  38.72, lon:  -9.14, info: 'Holiday' },
    { type: 'travel', name: 'Vienna, Austria',        lat:  48.21, lon:  16.37, info: 'Holiday' },
    { type: 'travel', name: 'Dubrovnik, Croatia',     lat:  42.64, lon:  18.11, info: 'Holiday' },

  ],

  /* ── Trips ──────────────────────────────────────────────────
     Cities are visited in the order listed.
     Duplicate the first city at the end to create a round trip.
     Required: name, color, cities []
     Optional: cycleSec (default 28)
     ────────────────────────────────────────────────────────── */
  trips: [

    {
      name:     'Japan 2023',
      color:    '#ff6b6b',   /* rose-red */
      cycleSec: 24,
      cities: [
        { name: 'Tokyo',        lat:  35.68, lon: 139.69 },
        { name: 'Nikko',        lat:  36.75, lon: 139.60 },
        { name: 'Kyoto',        lat:  35.01, lon: 135.76 },
        { name: 'Osaka',        lat:  34.69, lon: 135.50 },
        { name: 'Hiroshima',    lat:  34.38, lon: 132.44 },
        { name: 'Tokyo',        lat:  35.68, lon: 139.69 },   /* return */
      ],
    },

    {
      name:     'East Coast USA 2022',
      color:    '#c084fc',   /* violet */
      cycleSec: 18,
      cities: [
        { name: 'New York',     lat:  40.71, lon: -74.01 },
        { name: 'Philadelphia', lat:  39.95, lon: -75.17 },
        { name: 'Washington',   lat:  38.90, lon: -77.04 },
        { name: 'Boston',       lat:  42.36, lon: -71.06 },
        { name: 'New York',     lat:  40.71, lon: -74.01 },   /* return */
      ],
    },

  ],

  /* ── Regions ────────────────────────────────────────────────
     For small islands and countries — renders a glowing disc.
     Required: name, lat, lon, radius, color, info
     ────────────────────────────────────────────────────────── */
  regions: [

    { name: 'Tenerife',  lat:  28.29, lon: -16.63, radius: 1.2, color: '#ff8c42', info: 'Canary Islands — holiday' },
    { name: 'Mallorca',  lat:  39.70, lon:   2.97, radius: 1.0, color: '#ff8c42', info: 'Balearic Islands — holiday' },
    { name: 'Sardinia',  lat:  40.12, lon:   9.07, radius: 1.4, color: '#ff8c42', info: 'Holiday' },
    { name: 'Corsica',   lat:  42.04, lon:   9.01, radius: 1.0, color: '#ff8c42', info: 'Holiday' },

  ],

};
