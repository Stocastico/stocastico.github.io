# Website Improvement Suggestions

## 2. Visual Improvements

### Already implemented

| Change | Effect |
| -------- | -------- |
| **Reading progress bar** | Gradient line slides across the very top of the viewport as you scroll |
| **Back-to-top button** | Frosted-glass circle with an up-arrow, fades in after scrolling 60 % of the page |
| **Nav active-link polish** | Active section underline is cyan + a tiny glowing dot appears above the active link; section tags become pill badges with a translucent purple border |

### Still to consider

- **Cursor glow / trail** — a soft radial gradient that follows the mouse, giving depth to the dark background (see: Linear.app)
- **Section dividers** — subtle gradient lines or faint grain texture between `section` and `section-alt` transitions
- **Animated gradient border** on cards — a rotating conic-gradient border on hover (popularised by Vercel's card designs)
- **Staggered word reveal** on the hero tagline — each word slides up with a 40 ms offset for a cinematic feel
- **Photo card** — replace the "SM" placeholder with a real photo; add a subtle ring of glowing accent color around it
- **Typography refinement** — increase the `--section-py` slightly and add a `max-width: 60ch` on all body paragraphs for better readability

---

## 3. Additional 3D Effects

| Effect | Library / Technique | Impact |
| -------- | --------------------- | -------- |
| **Morphing blob** in hero | Raw WebGL / GLSL `smoothstep` | Replace or complement the noise canvas with an organically morphing iridescent blob — very popular in 2024–2025 AI sites |
| **Depth-of-field atmosphere on globe** | Three.js `EffectComposer` + `BokehPass` | Foreground pins stay sharp while the sphere softly blurs at the edges |
| **Scroll-driven 3D depth cards** for Publications | CSS `perspective` + `translateZ` on scroll | Publications stack like playing cards and fan out as you scroll into the section |
| **Fluid / liquid shader** on section headers | GLSL fragment shader, simplex noise | Section `h2` text is carved into a liquid-metal animated surface |
| **Particle burst on CTA hover** | Three.js instanced mesh | Small burst of glowing orbs explodes outward from the "Get in Touch" button on hover |
| **WebGL post-processing** on neural network | Three.js `UnrealBloomPass` | Adds bloom glow to the particle network — inexpensive but dramatic improvement to hero atmosphere |
| **3D skill wheel** | Three.js + raycasting | Replace the flat skill tag grid with a 3D rotating ring of tech logos that responds to scroll |

---

## 4. New Sections to Add

| Section | Why it works |
| --------- | ------------- |
| **Open Source / Projects** | Showcases practical impact; GitHub stats cards, demo links, tech stack badges |
| **Talks & Presentations** | Conference talks signal thought leadership; embed YouTube/Vimeo clips inline |
| **Awards & Distinctions** | PhD distinction, best paper awards — quick trust-builders |
| **Teaching** | Courses taught, supervision; important for academic positioning |
| **Media / Press** | Any interview, podcast appearance, or press mention |
| **Testimonials** | 2–3 quotes from collaborators or advisors with photos — social proof |
| **Now / Currently** | A live "what I'm working on right now" section (inspired by Derek Sivers' `/now` pages) |

---

## 5. Restructuring Ideas

### Inspired by **Linear.app** (sharp, bold, asymmetric)

- Move the hero from centered to **left-aligned** — name in large left column, neural network taking up the full right half. More dynamic, less generic.
- Use an **asymmetric 2-column layout** for the About section with the globe filling the right half of the viewport.

### Inspired by **Stripe** (horizontal scrolling features)

- Turn the Research section into a **horizontal scroll carousel** — wide cards scroll left-to-right with snap points, making it feel interactive rather than a static list.

### Inspired by **Apple** (sticky, full-screen storytelling)

- Implement **sticky scroll sections**: as you scroll, text animates in over a fixed 3D scene. E.g., the globe stays fixed while bullet-points about your career fly in from the right.

### Inspired by **Vercel / Next.js** (speed & minimalism)

- Flatten the nav to just **4 top-level items**: Work, Research, Writing, Contact — combine CV+Skills into "Work", merge Publications+Research into "Research".
- Add a **command palette** (`⌘K`) that lets visitors jump to any section, open a PDF CV, or copy your email — a delight for technical visitors.

### General restructuring wins

- **Separate the CV** into its own page (`/cv`) — the current single-page scroll is long; a dedicated CV page keeps `index.html` fast and focused.
- **Move Blog above Contact** — it's more engaging content to end on than a simple contact grid.
- Add a **sticky side progress indicator** on desktop (vertical dots on the right edge, one per section) — like Medium articles. The `aria-current` logic is already in place.
