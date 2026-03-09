/* ============================================================
   GLOBE LOCATIONS (GENERATED FILE)
   ============================================================
   Source of truth: data/locations.yaml
   Generate with:   ./scripts/update-locations.sh

   You can still edit this file manually, but it is intended to be
   generated from YAML so you do not need to manage coordinates/colors.

   FOUR-COLOUR SYSTEM
   ───────────────────
   Cyan  #00d4ff — "lived here" (past)
     "lived" — the city was your home (large pulsing pin)

   Yellow #ffeb00 — "living now"
     "current" — your current home (large pulsing pin)

   Blue #0099ff — "work trips"
     "worktrip" — you worked or did research here (small static pin)

   Coral #ff8c42 — "holidays & exploration"
     "holiday" — holidays, tourism (small static pin)
     trips    — your colour is set per trip, defaults to coral
     regions  — island / country discs, also default coral

   OMITTING LAT / LON
   ───────────────────
   You can leave out lat and lon entirely — the globe will
   automatically look them up via OpenStreetMap on first load.
   Example:
     { type: 'travel', name: 'Reykjavik, Iceland', info: 'Holiday' }
   If the name can't be found the pin is silently skipped.
   Tip: add country context ("Berlin, Germany") for accuracy.

   TRIPS
   ──────
   Cities are visited in the order listed.
   Duplicate the first city at the end for a round trip.
   "cycleSec" = seconds per full loop (default 28).

   REGIONS
   ────────
   For small islands / countries where a pin is too tiny.
   Renders a glowing disc on the globe surface.
   "radius" in degrees of arc:
     0.5 ≈ 55 km radius  |  1.0 ≈ 110 km  |  2.0 ≈ 220 km
   ============================================================ */

/* global LOCATIONS */
const LOCATIONS = {

  /* ── Pins ──────────────────────────────────────────────────
     Required: type, name, info
     Optional: lat, lon  (auto-geocoded if omitted)
     ────────────────────────────────────────────────────────── */
  pins: [

    // ─ Lived — cyan, large pulsing pin ──────────────────────
    { type: 'lived', name: 'Crema, Italy', lat: 45.36, lon: 9.68, info: 'Home town' },

    // ─ Current — yellow, large pulsing pin ────────────────
    { type: 'current', name: 'San Sebastián, Spain', lat: 43.32, lon: -1.98, info: 'Current home' },

    // ─ Work trips — blue, small static pin ────────────────
    { type: 'worktrip', name: 'Bilbao, Spain', lat: 43.26, lon: -2.93, info: 'Vicomtech Foundation' },
    { type: 'worktrip', name: 'Barcelona, Spain', lat: 41.38, lon: 2.17, info: 'GRUP MEDIAPRO HQ' },
    { type: 'worktrip', name: 'Madrid, Spain', lat: 40.42, lon: -3.70, info: 'Conferences' },
    { type: 'worktrip', name: 'Berlin, Germany', lat: 52.52, lon: 13.40, info: 'Fraunhofer HHI' },
    { type: 'worktrip', name: 'Amsterdam, Netherlands', lat: 52.37, lon: 4.90, info: 'IBC Show' },
    { type: 'worktrip', name: 'London, UK', lat: 51.50, lon: -0.12, info: 'Research visits' },
    { type: 'worktrip', name: 'Milan, Italy', lat: 45.46, lon: 9.19, info: 'Conferences' },
    { type: 'worktrip', name: 'New York, USA', lat: 40.71, lon: -74.01, info: 'Research conference' },
    { type: 'worktrip', name: 'Tokyo, Japan', lat: 35.68, lon: 139.69, info: 'Research visit' },

    // ─ Holidays — coral, small static pin ─────────────────────
    { type: 'holiday', name: 'Paris, France', lat: 48.86, lon: 2.35, info: 'Holiday' },
    { type: 'holiday', name: 'Prague, Czechia', lat: 50.07, lon: 14.43, info: 'Holiday' },
    { type: 'holiday', name: 'Lisbon, Portugal', lat: 38.72, lon: -9.14, info: 'Holiday' },
    { type: 'holiday', name: 'Vienna, Austria', lat: 48.21, lon: 16.37, info: 'Holiday' },
    { type: 'holiday', name: 'Dubrovnik, Croatia', lat: 42.64, lon: 18.11, info: 'Holiday' },

    // ─ Holidays with explicit coordinates (no geocoding request needed) ─
    { type: 'holiday', name: 'Reykjavik, Iceland', lat: 64.1466, lon: -21.9426, info: 'Holiday' },

  ],

  /* ── Trips ──────────────────────────────────────────────────
     Required: name, cities []
     Optional: color (default coral), cycleSec (default 28)
     City fields: name, info — lat/lon optional (auto-geocoded)
     ────────────────────────────────────────────────────────── */
  trips: [

    {
      name: 'Japan 2023',
      color: '#ff6b6b',   /* rose-red */
      cycleSec: 24,
      cities: [
        { name: 'Tokyo', lat: 35.68, lon: 139.69 },
        { name: 'Nikko', lat: 36.75, lon: 139.60 },
        { name: 'Kyoto', lat: 35.01, lon: 135.76 },
        { name: 'Osaka', lat: 34.69, lon: 135.50 },
        { name: 'Hiroshima', lat: 34.38, lon: 132.44 },
        { name: 'Tokyo', lat: 35.68, lon: 139.69 },   /* return */
      ],
    },

    {
      name: 'East Coast USA 2022',
      color: '#c084fc',   /* violet */
      cycleSec: 18,
      cities: [
        { name: 'New York', lat: 40.71, lon: -74.01 },
        { name: 'Philadelphia', lat: 39.95, lon: -75.17 },
        { name: 'Washington', lat: 38.90, lon: -77.04 },
        { name: 'Boston', lat: 42.36, lon: -71.06 },
        { name: 'New York', lat: 40.71, lon: -74.01 },   /* return */
      ],
    },

  ],

  /* ── Regions ────────────────────────────────────────────────
     Required: name, radius, info
     Optional: lat, lon (auto-geocoded), color (default coral)
     ────────────────────────────────────────────────────────── */
  regions: [

    { name: 'Tenerife, Spain', lat: 28.29, lon: -16.63, radius: 1.2, color: '#ff8c42', info: 'Canary Islands — holiday' },
    { name: 'Mallorca, Spain', lat: 39.70, lon: 2.97, radius: 1.0, color: '#ff8c42', info: 'Balearic Islands — holiday' },
    { name: 'Sardinia, Italy', lat: 40.12, lon: 9.07, radius: 1.4, color: '#ff8c42', info: 'Holiday' },
    { name: 'Corsica, France', lat: 42.04, lon: 9.01, radius: 1.0, color: '#ff8c42', info: 'Holiday' },

  ],

};
