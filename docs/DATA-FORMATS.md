# Data Formats Reference

This document describes the YAML format for the two source-of-truth data files:

- [`data/cv.yaml`](#cvyaml) — Curriculum Vitae (career, education, skills)
- [`data/locations.yaml`](#locationsyaml) — Globe pins, animated trips, and regions

After editing either file, run the corresponding generator script to rebuild the JavaScript file consumed by the site.

---

## `data/cv.yaml`

**Generator:** `npm run generate-cv` → writes `data/cv.js`

### YAML parser limitations

The project uses a lightweight built-in YAML parser (`scripts/lib/yaml.js`). Supported features:

| Feature | Supported |
|---------|-----------|
| Plain strings | Yes |
| Quoted strings (`'…'` and `"…"`) | Yes |
| Folded block scalar (`>`) | Yes |
| Literal block scalar (`\|`) | Yes |
| Block sequences (`- item`) | Yes |
| Nested mappings | Yes |
| Comments (`# …`) | Yes |
| Null / booleans / numbers | Yes |
| Anchors and aliases (`&` / `*`) | **No** |
| Flow style (`{ }`, `[ ]`) | **No** |
| Multi-document (`---`) | **No** |
| Tags (`!!type`) | **No** |

---

### Top-level structure

```yaml
career:    [...]   # Required — list of career entries
education: [...]   # Required — list of education entries
skills:    {...}   # Optional — skills object
```

---

### `career` — list of work experience entries

Each entry is a YAML mapping. Required fields are `year`, `role`, and `company`.

```yaml
career:
  - year:        "2024 – present"      # string, date range
    role:        Senior AI Engineer    # string, job title
    company:     Acme Corp             # string, employer name
    location:    "Barcelona, ES"       # optional string, shown on the timeline
    description: >                     # optional — folded block scalar
      One or two sentences describing
      responsibilities and achievements.
    tags:                              # optional — list of short keyword strings
      - Python
      - GenAI
      - LLMs
```

#### Field reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `year` | string | Yes | Displayed verbatim, e.g. `"2022 – 2024"` or `"2024 – present"` |
| `role` | string | Yes | Job title |
| `company` | string | Yes | Employer / organisation name |
| `location` | string | No | City and country code, e.g. `"Berlin, DE"` |
| `description` | string | No | Multi-sentence paragraph; use `>` for folded block or a quoted string for a single line |
| `tags` | list of strings | No | Short technology/domain keywords rendered as badges |

#### Block scalar tips

Use a **folded block scalar** (`>`) for multi-line descriptions so you can wrap long lines in the source file without adding literal line breaks to the output:

```yaml
description: >
  Designed and deployed GenAI solutions for audiovisual production,
  including automatic highlight detection and chatbot integrations.
  All newlines within the block become spaces.
```

Use a **literal block scalar** (`|`) if you want preserved newlines (e.g. bullet-point style):

```yaml
description: |
  Line one stays on its own line.
  Line two also stays separate.
```

---

### `education` — list of academic credentials

```yaml
education:
  - year:        "2019 – 2024"
    degree:      "PhD — Computer Science"
    institution: "Euskal Herriko Unibertsitatea (UPV/EHU)"
    location:    "Bilbao, ES"
    description: >
      Thesis: "A Novel Architecture for Collaborative AR Experiences."
      Graduated cum laude.
```

#### Field reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `year` | string | Yes | Date range, e.g. `"2005 – 2008"` |
| `degree` | string | Yes | Degree title, e.g. `"MSc — Telecommunications Engineering"` |
| `institution` | string | Yes | University or school name |
| `location` | string | No | City and country |
| `description` | string | No | Thesis note, honours, or other detail |

---

### `skills` — grouped skill tiers

```yaml
skills:
  technical:
    - name: "Python · PyTorch · TensorFlow"
      tier: Expert
  leadership:
    - name: Technical team management & mentoring
      tier: Advanced
  languages:
    - name:        Italian
      proficiency: Native
```

#### `technical` and `leadership` items

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | Skill label (displayed as-is) |
| `tier` | string | Yes | One of `Expert`, `Advanced`, `Proficient` (a closed set — a percentage on a skill is fake precision) |

#### `languages` items

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | Language name |
| `proficiency` | string | Yes | Free-form descriptor, e.g. `"C2 — Proficient"`, `"Native"`, `"B2 — Upper-Intermediate"` |

---

### Complete `cv.yaml` example

```yaml
# cv.yaml — edit then run: npm run generate-cv

career:
  - year:        "2024 – present"
    role:        Senior AI Engineer
    company:     Acme Corp
    location:    "Barcelona, ES"
    description: >
      Led the design and deployment of GenAI pipelines for
      document understanding and semantic search.
    tags:
      - GenAI
      - RAG
      - Python

  - year:        "2020 – 2024"
    role:        Machine Learning Engineer
    company:     Another Company
    location:    "Berlin, DE"
    tags:
      - Computer Vision
      - PyTorch

education:
  - year:        "2016 – 2020"
    degree:      "PhD — Computer Science"
    institution: "Technical University of Berlin"
    location:    "Berlin, DE"
    description: Thesis on real-time object detection.

  - year:        "2014 – 2016"
    degree:      "MSc — Electrical Engineering"
    institution: "University of Milan"
    location:    "Milan, IT"

skills:
  technical:
    - name: "Python · PyTorch · TensorFlow"
      tier: Expert
    - name: "Computer Vision & Deep Learning"
      tier: Advanced
    - name: "MLOps · Docker · CI/CD"
      tier: Proficient

  leadership:
    - name:  Team management & mentoring
      level: 85
    - name:  Technical roadmap & architecture
      level: 80

  languages:
    - name:        English
      proficiency: "C2 — Proficient"
    - name:        German
      proficiency: "B1 — Intermediate"
    - name:        Italian
      proficiency: Native
```

After editing, regenerate and validate:

```bash
node scripts/generate-cv.js --validate    # check for errors first
npm run generate-cv                        # write data/cv.js
```

---

## `data/locations.yaml`

**Generator:** `npm run generate-locations` → writes `data/locations.js`

The travel page's globe and 2-D Europe map are driven entirely by this file. The generator auto-geocodes any city names that lack explicit `lat`/`lon` values using the OpenStreetMap Nominatim API, and caches results in `.cache/locations-geocode-cache.json`.

**Geocoding happens here and only here.** `js/globe.js` used to carry a browser-side copy that filled in missing coordinates at page load; it is gone, along with the `connect-src https://nominatim.openstreetmap.org` it kept open in every page's CSP. So an entry that reaches `data/locations.js` without coordinates is now simply dropped by both maps rather than looked up. `test/main.node.test.mjs` fails if that ever happens — the fix is to re-run `npm run generate-locations`, not to add coordinates by hand.

### Top-level structure

```yaml
pins:    [...]   # Optional — individual map pins
trips:   [...]   # Optional — animated round-trip routes
```

All three sections are optional; you can use any combination.

---

### `pins` — location markers

Pins appear as glowing spikes or pulsing rings on the globe. Three types are supported:

| Type | Appearance | Use for |
|------|-----------|---------|
| `lived` | Large pulsing cyan ring | Cities where you have lived |
| `work` | Small cyan spike | Work locations and conferences |
| `travel` | Small coral spike | Holiday destinations |

```yaml
pins:
  - type: lived
    name: Berlin, Germany
    info: Worked here for 6 years

  - type: work
    name: Amsterdam, Netherlands
    info: IBC Show

  - type: travel
    name: Reykjavik, Iceland
    info: Holiday

  # Provide explicit coordinates to skip geocoding:
  - type: travel
    name: Hidden Gem
    lat:  44.4949
    lon:  11.3426
    info: My secret spot
```

#### Field reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | string | Yes | One of: `lived`, `work`, `travel` |
| `name` | string | Yes | Place name; used for geocoding if `lat`/`lon` are absent |
| `info` | string | No | Tooltip text shown on hover |
| `lat` | number | No | Latitude in decimal degrees (−90 to 90) |
| `lon` | number | No | Longitude in decimal degrees (−180 to 180) |

If `lat` and `lon` are both omitted, the generator queries Nominatim with the value of `name` and caches the result. Subsequent runs use the cache.

---

### `trips` — animated travel routes

Trips are drawn as animated Bézier curves with a comet that travels along the path in a loop.

```yaml
trips:
  - name:     Japan 2023
    cycleSec: 24                 # seconds for one full loop (default: 28)
    color:    "#ff6b6b"          # CSS hex color (auto-assigned if omitted)
    cities:
      - Tokyo, Japan
      - Kyoto, Japan
      - Osaka, Japan
      - Tokyo, Japan             # repeat first city to close the loop
```

#### Field reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | Label shown in the globe UI |
| `cities` | list of strings | Yes | Ordered city names; repeat the first as the last to create a closed loop |
| `cycleSec` | number | No | Animation loop duration in seconds. Default: `28` |
| `color` | string | No | CSS hex colour, e.g. `"#ff6b6b"`. Auto-assigned from a palette if omitted |

The generator geocodes each city in `cities` using the same Nominatim cache as pins.

#### Auto-assigned colours

When `color` is omitted, trips are assigned colours from this rotating palette:

```text
#ff6b6b  #c084fc  #22c55e  #38bdf8  #f59e0b  #fb7185
```

---

### Complete `locations.yaml` example

```yaml
# locations.yaml — edit then run: npm run generate-locations

pins:
  # Places I have lived
  - type: lived
    name: Milan, Italy
    info: Home city

  - type: lived
    name: Berlin, Germany
    info: Lived here 2010–2016

  # Work locations
  - type: work
    name: London, UK
    info: Research visits

  - type: work
    name: New York, USA
    info: IEEE conference

  # Travel destinations
  - type: travel
    name: Kyoto, Japan
    info: Cherry blossom season

  - type: travel
    name: Lisbon, Portugal
    info: Holiday

trips:
  - name:     Japan 2023
    cycleSec: 24
    cities:
      - Tokyo, Japan
      - Kyoto, Japan
      - Osaka, Japan
      - Hiroshima, Japan
      - Tokyo, Japan

  - name:     European Road Trip 2022
    cycleSec: 20
    color:    "#22c55e"
    cities:
      - Milan, Italy
      - Nice, France
      - Barcelona, Spain
      - Madrid, Spain
      - Milan, Italy

regions:
  - name:   Sicily, Italy
    radius: 1.6
    info:   Summer holidays

  - name:   Mallorca, Spain
    radius: 1.0
    info:   Balearic Islands
```

After editing:

```bash
npm run generate-locations
# or:
./scripts/update-locations.sh
```

---

## Blog post frontmatter

Blog posts are Markdown files with a YAML frontmatter block at the top. The `new-post` script reads this metadata to generate the HTML and the `data/blog.js` entry.

```markdown
---
title:   "My Post Title"
date:    "2025-03-01"
excerpt: "One-sentence summary shown on the homepage card."
tag:     "Research"
readMin: 6
lead:    "Optional large-type opening sentence."
url:     "blog/custom-slug.html"
---

## Introduction

Your content here…
```

### Field reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | Yes | Post title |
| `date` | string | Yes | ISO date `YYYY-MM-DD` |
| `excerpt` | string | Yes | Short teaser shown on the homepage card |
| `tag` | string | No | Badge label, e.g. `"Research"`, `"Engineering"`, `"AI"` |
| `readMin` | integer | No | Estimated reading time in minutes |
| `lead` | string | No | Opening sentence displayed in larger type at the top of the post |
| `url` | string | No | Override the output path; defaults to `blog/<slugified-title>.html` |

Run the generator:

```bash
npm run new-post -- path/to/my-post.md
```
