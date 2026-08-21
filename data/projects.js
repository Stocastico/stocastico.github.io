/* ============================================================
   PROJECTS  —  edit this file to add or update project cards
   ============================================================

   Each entry shape:
   {
     id:          'my-project',               // kebab-case, used as HTML anchor
     kind:        'work',                     // REQUIRED — 'work' | 'personal'
     title:       'My Project Title',         // short title (one line)
     year:        '2024',                     // project year (string)
     tags:        ['Computer Vision'],        // 1–2 labels from PROJECT_TAGS below
     bg:          'img/projects/my-bg.jpg',    // detail-page hero + og:image
     description: 'Short 2–3 sentence summary shown on the homepage card.',
     url:         'projects/my-project.html', // the detail page (not an
                                              // anchor — no card carries an id,
                                              // and projects.html's cards are
                                              // filterable, so an anchor into
                                              // one could be hidden)
     lang:        'es',                       // OPTIONAL — only for a url that
                                              // leaves the English site; becomes
                                              // hreflang on the card anchor
     updated:     '2026-03-14',               // OPTIONAL — YYYY-MM-DD, the Atom
                                              // feed's <updated>; defaults to
                                              // Jan 1 of `year`
   }

   `updated` is an editorial date, not a file date. It used to be the page's
   last git commit, which meant a CSP-hash refresh or a typo fix republished
   the project to every feed subscriber — eight of fourteen entries once
   carried the dates of two audits that changed no prose. Set it when the
   write-up meaningfully changes; leave it alone otherwise. Re-run
   `npm run generate-feed` after editing.

   `bg` is only read by a `projects/*.html` detail page (hero + og:image), so an
   entry whose url points elsewhere omits it rather than shipping an image
   nothing renders.

   `kind` has no default on purpose. 'work' is professional or research work;
   'personal' is a side project, which gets a badge on its card and is kept off
   the homepage entirely. Omitting the field fails `npm run generate-cards`
   rather than silently defaulting — see js/render-cards.js.

   `tags` is a **closed vocabulary** — the six facets in PROJECT_TAGS below,
   spelled by their `label`, one or two per project. It used to be free text,
   and free text is what it became: 14 projects carrying 32 distinct tags, 28 of
   them used exactly once. As badges that was only noisy; as the filter
   vocabulary on projects.html it was useless, since almost every facet would
   have returned a single card. Three rules keep it a vocabulary rather than a
   list, all asserted by test/project-tags.test.mjs: a tag must be in
   PROJECT_TAGS, a project may carry at most two, and a facet must be used by at
   least two projects. That last one is the load-bearing rule — it means adding a
   seventh facet costs two projects, so the singleton drift cannot restart one
   entry at a time.

   The newest project should appear first.
   The homepage shows up to 3 'work' projects; projects.html shows everything.
   ============================================================ */

/* The six facets themselves live in js/project-tags.js — js/render-cards.js
   needs them to put slugs on a card, and it is imported statically by
   js/main.js, so anything it reaches lands in the eager bundle of all 21
   pages. Re-exported here so the vocabulary still reads next to the data it
   describes, and so `import { PROJECTS, PROJECT_TAGS }` works from one place. */
export { PROJECT_TAGS, PROJECT_TAG_SLUGS, tagSlugsFor } from '../js/project-tags.js';

export const PROJECTS = [
    {
            id: "donostia-dataviz",
            kind: "personal",
            title: "Is tourism raising the rent? Donostia, in open data",
            year: "2026",
            tags: ["Data & Interactive"],
            description: "Seven data stories about how San Sebastián is changing — housing, barrios, people, climate, and the gap between the tourist city and the lived one. Built from six open sources with a reproducible pipeline; the question that started it turned out to have an uncomfortable answer. Written in Spanish.",
            /* No detail page: the piece introduces itself — title, subtitle,
               sources and methodology are all on its own first screen — so a
               write-up here would only delay the reader by a click. It lives in
               its own repo, served from this same domain by GitHub Pages, which
               is why a root-relative path reaches it. `lang` puts hreflang on
               the card, and generate-sitemap skips any url outside projects/. */
            url: "/donostia-dataviz/",
            lang: "es",
        },
    {
            id: "mnist-lenet",
            kind: "personal",
            title: "Draw a digit, watch a LeNet-5 read it",
            year: "2026",
            tags: ["Data & Interactive"],
            bg: "img/projects/mnist-lenet.svg",
            description: "A LeNet-5 trained on MNIST, running live in the browser. Draw a digit with the mouse and watch every layer's activations light up as the signal propagates to a verdict.",
            url: "projects/mnist-lenet.html",
        },
    {
            id: "gaussian-nerf",
            kind: "work",
            title: "3D reconstruction using Gaussian Splatting and NeRF",
            year: "2025",
            tags: ["Computer Vision","AR & 3D"],
            bg: "img/projects/gaussian-splat.webp",
            description: "Capturing real locations as photorealistic assets for LED-volume virtual production. Benchmarked nerfacto, splatfacto and MCMC against RealityCapture and Postshot, and shipped a desktop app that runs COLMAP pose estimation and reconstructs either locally or on Azure.",
            url: "projects/gaussian-nerf.html",
        },
    {
            id: "brand-stadium",
            kind: "work",
            title: "Brand recognition in football matches",
            year: "2025",
            tags: ["Computer Vision","Media & Live Events"],
            bg: "img/projects/annotated-stadium.webp",
            description: "Measures how much screen time each brand gets in a football broadcast. A YOLO detector finds the boards, a DenseNet201 sorts them into 52 brands — despite motion blur, a 40× class imbalance, and LED ads that change weekly. In production on Azure.",
            url: "projects/brand-stadium.html",
        },
    {
            id: "aroundtheworld",
            kind: "work",
            title: "ARoundTheWorld: Collaborative AR for Education",
            year: "2024",
            tags: ["AR & 3D","Education & Research"],
            bg: "img/projects/ARound_the_world_2.webp",
            description: "ARoundTheWorld is a multiplatform collaborative AR geography application built on the cleAR architecture. It was evaluated with 44 students across three schools and represents the final paper of my PhD, validating that the architecture can produce applications that integrate seamlessly into existing school curricula.",
            url: "projects/aroundtheworld.html",
        },
    {
            id: "clear-architecture",
            kind: "work",
            title: "cleAR: Interoperable Architecture for Multi-User AR",
            year: "2023",
            tags: ["AR & 3D","Education & Research"],
            bg: "img/projects/clear-architecture.webp",
            description: "cleAR is a modular, interoperable architecture for building multi-user augmented reality applications in education. Designed from the ground up to bridge the gap between AR's potential and its limited classroom adoption, it was the core contribution of my PhD research.",
            url: "projects/clear-architecture.html",
        },
    {
            id: "rag-document-qa",
            kind: "work",
            title: "RAG Document Assistant for Financial Services",
            year: "2023",
            tags: ["LLMs & MLOps"],
            bg: "img/projects/rag-query.svg",
            description: "A retrieval-augmented generation system built for a large European bank, replacing manual SharePoint search with a conversational assistant that answers questions and cites the exact document and page where each answer was found.",
            url: "projects/rag-document-qa.html",
        },
    {
            id: "mlops-vertex-media",
            kind: "work",
            title: "MLOps Platform on GCP for a Spanish Media Group",
            year: "2022 – 2023",
            tags: ["LLMs & MLOps"],
            bg: "img/projects/mlops-bg.webp",
            description: "An MLOps platform on Google Cloud for one of Spain's largest media groups. Took a portfolio of disconnected models — churn prediction, article recommendation and more — and rebuilt them as Vertex AI pipelines with versioning, monitoring and drift detection.",
            url: "projects/mlops-vertex-media.html",
        },
    {
            id: "traction",
            kind: "work",
            title: "TRACTION: Opera Co-creation for Social Transformation",
            year: "2020 – 2022",
            tags: ["Media & Live Events","Education & Research"],
            bg: "img/projects/traction-bg.webp",
            description: "TRACTION was a Horizon 2020 project, coordinated by Vicomtech, that used opera as a vehicle for social inclusion. My work centred on the Co-creation Stage, the real-time distributed performance tool, spanning development, user-requirements gathering, evaluation, and direct engagement with artistic and community partners across Barcelona, Leiria and Ireland.",
            url: "projects/traction.html",
        },
    {
            id: "audience-engagement",
            kind: "work",
            title: "Multi-modal Audience Engagement Measurement System",
            year: "2020",
            tags: ["Computer Vision","Media & Live Events"],
            bg: "img/projects/audience-engagement-bg.webp",
            description: "A multi-modal system that measures audience engagement at live events by fusing computer vision with WiFi/Bluetooth signal analysis. Designed, implemented, and validated at Vicomtech in 2020, and released as open-source software.",
            url: "projects/audience-engagement.html",
        },
    {
            id: "ufc-fighter-tracking",
            kind: "work",
            title: "UFC Fighter Tracking: Multi-Modal Sensing in the Octagon",
            year: "2017",
            tags: ["Computer Vision","Media & Live Events"],
            bg: "img/projects/ufc-octagon-bg.webp",
            description: "Real-time analytics for live UFC events: stereo vision in the truss above the octagon, accelerometers in the gloves, GPU inference at the venue. Demoed live during Werner Vogels' keynote at AWS re:Invent 2017.",
            url: "projects/ufc-fighter-tracking.html",
        },
    {
            id: "mpi-brain-research",
            kind: "work",
            title: "MPI for Brain Research: Software for Reptilian Neuroscience",
            year: "2015 – 2017",
            tags: ["Education & Research"],
            bg: "img/projects/mpi-brain-bg.webp",
            description: "Two years as a scientific software developer in Gilles Laurent's department at the Max Planck Institute for Brain Research in Frankfurt, building MATLAB analysis pipelines and R/Shiny web apps for electrophysiologists studying sleep in bearded dragons and visual processing in ex-vivo turtle brains.",
            url: "projects/mpi-brain-research.html",
        },
    {
            id: "inevent",
            kind: "work",
            title: "inEvent: Structuring and Linking Multimedia Archives of Lectures and Meetings",
            year: "2011 – 2014",
            tags: ["Computer Vision","Media & Live Events"],
            bg: "img/projects/inevent-bg.webp",
            description: "An EU FP7 project treating archives of lectures and meetings as interconnected hyper-events. At Fraunhofer HHI I led the video analysis: segmentation, slide-transition detection, and face features for speaker linking. Published at VISAPP, Interspeech and the ACM MM Grand Challenge.",
            url: "projects/inevent.html",
        },
    {
            id: "avatech",
            kind: "work",
            title: "AVATecH: Automated Annotation of Audio/Video Corpora for Humanities Research",
            year: "2009 – 2014",
            tags: ["Computer Vision","Education & Research"],
            bg: "img/projects/avatech-bg.webp",
            description: "AVATecH was a joint Fraunhofer / Max Planck project that brought state-of-the-art audio and video pattern recognition into ELAN, the de-facto annotation tool used by linguists, anthropologists, and psychologists worldwide, turning weeks of manual labelling into minutes of supervised review.",
            url: "projects/avatech.html",
        }];

