/* ============================================================
   PROJECTS  —  edit this file to add or update project cards
   ============================================================

   Each entry shape:
   {
     id:          'my-project',               // kebab-case, used as HTML anchor
     kind:        'work',                     // REQUIRED — 'work' | 'personal'
     title:       'My Project Title',         // short title (one line)
     year:        '2024',                     // project year (string)
     tags:        ['AI', 'CV'],               // 1–3 keyword badges
     bg:          'img/projects/my-bg.jpg',    // detail-page hero + og:image
     description: 'Short 2–3 sentence summary shown on the homepage card.',
     url:         'projects.html#my-project', // link to detail section
     lang:        'es',                       // OPTIONAL — only for a url that
                                              // leaves the English site; becomes
                                              // hreflang on the card anchor
   }

   `bg` is only read by a `projects/*.html` detail page (hero + og:image), so an
   entry whose url points elsewhere omits it rather than shipping an image
   nothing renders.

   `kind` has no default on purpose. 'work' is professional or research work;
   'personal' is a side project, which gets a badge on its card and is kept off
   the homepage entirely. Omitting the field fails `npm run generate-cards`
   rather than silently defaulting — see js/render-cards.js.

   The newest project should appear first.
   The homepage shows up to 3 'work' projects; projects.html shows everything.
   ============================================================ */

export const PROJECTS = [
    {
            id: "donostia-dataviz",
            kind: "personal",
            title: "Is tourism raising the rent? Donostia, in open data",
            year: "2026",
            tags: ["Data Journalism","Open Data","Python"],
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
            tags: ["Deep Learning","Interactive","JavaScript"],
            bg: "img/projects/mnist-lenet.svg",
            description: "A LeNet-5 trained on MNIST, running live in the browser. Draw a digit with the mouse and watch every layer's activations light up as the signal propagates to a verdict.",
            url: "projects/mnist-lenet.html",
        },
    {
            id: "gaussian-nerf",
            kind: "work",
            title: "3D reconstruction using Gaussian Splatting and NeRF",
            year: "2025",
            tags: ["AI","Computer Vision"],
            bg: "img/projects/gaussian-splat.webp",
            description: "Research into NeRFs and 3D Gaussian Splatting as a pipeline for capturing real-world locations as photorealistic assets for LED-volume virtual production. Evaluated camera setups, algorithms (nerfacto, splatfacto, MCMC), and Unreal Engine integration — benchmarked against RealityCapture and Postshot. The work produced a desktop application that runs COLMAP pose estimation followed by user-chosen reconstruction either locally or on Azure, with a browser-based Gaussian splat viewer.",
            url: "projects/gaussian-nerf.html",
        },
    {
            id: "brand-stadium",
            kind: "work",
            title: "Brand recognition in football matches",
            year: "2025",
            tags: ["AI","Computer Vision"],
            bg: "img/projects/annotated-stadium.webp",
            description: "A computer-vision system that measures how much screen time each brand gets in football broadcasts. A YOLO detector finds the perimeter boards and LED signage; a DenseNet201 classifier sorts each into one of 52 brands — coping with small, motion-blurred crops, a 40× class imbalance, and LED ads that rotate weekly. Runs in production on Azure, validated against human annotators.",
            url: "projects/brand-stadium.html",
        },
    {
            id: "aroundtheworld",
            kind: "work",
            title: "ARoundTheWorld: Collaborative AR for Education",
            year: "2024",
            tags: ["AR","Education","User Study"],
            bg: "img/projects/ARound_the_world_2.webp",
            description: "ARoundTheWorld is a multiplatform collaborative AR geography application built on the cleAR architecture. It was evaluated with 44 students across three schools and represents the final paper of my PhD, validating that the architecture can produce applications that integrate seamlessly into existing school curricula.",
            url: "projects/aroundtheworld.html",
        },
    {
            id: "clear-architecture",
            kind: "work",
            title: "cleAR: Interoperable Architecture for Multi-User AR",
            year: "2023",
            tags: ["AR","Education","Architecture"],
            bg: "img/projects/clear-architecture.webp",
            description: "cleAR is a modular, interoperable architecture for building multi-user augmented reality applications in education. Designed from the ground up to bridge the gap between AR's potential and its limited classroom adoption, it was the core contribution of my PhD research.",
            url: "projects/clear-architecture.html",
        },
    {
            id: "rag-document-qa",
            kind: "work",
            title: "RAG Document Assistant for Financial Services",
            year: "2023",
            tags: ["RAG","LLM","NLP"],
            bg: "img/projects/rag-query.svg",
            description: "A retrieval-augmented generation system built for a large European bank, replacing manual SharePoint search with a conversational assistant that answers questions and cites the exact document and page where each answer was found.",
            url: "projects/rag-document-qa.html",
        },
    {
            id: "mlops-vertex-media",
            kind: "work",
            title: "MLOps Platform on GCP for a Spanish Media Group",
            year: "2022 – 2023",
            tags: ["MLOps","Vertex AI","GCP"],
            bg: "img/projects/mlops-bg.webp",
            description: "End-to-end MLOps platform built on Google Cloud for one of the largest media companies in Spain. Took a portfolio of disconnected ML models: churn prediction, article recommendation and several others, and rebuilt them as Vertex AI pipelines with versioning, monitoring, drift detection and CI/CD across the whole lifecycle.",
            url: "projects/mlops-vertex-media.html",
        },
    {
            id: "traction",
            kind: "work",
            title: "TRACTION: Opera Co-creation for Social Transformation",
            year: "2020 – 2022",
            tags: ["Web Application","Co-creation","Social Inclusion"],
            bg: "img/projects/traction-bg.webp",
            description: "TRACTION was a Horizon 2020 project, coordinated by Vicomtech, that used opera as a vehicle for social inclusion. My work centred on the Co-creation Stage, the real-time distributed performance tool, spanning development, user-requirements gathering, evaluation, and direct engagement with artistic and community partners across Barcelona, Leiria and Ireland.",
            url: "projects/traction.html",
        },
    {
            id: "audience-engagement",
            kind: "work",
            title: "Multi-modal Audience Engagement Measurement System",
            year: "2020",
            tags: ["Computer Vision","Multi-modal Sensing","Live Events"],
            bg: "img/projects/audience-engagement-bg.webp",
            description: "A multi-modal system that measures audience engagement at live events by fusing computer vision with WiFi/Bluetooth signal analysis. Designed, implemented, and validated at Vicomtech in 2020, and released as open-source software.",
            url: "projects/audience-engagement.html",
        },
    {
            id: "ufc-fighter-tracking",
            kind: "work",
            title: "UFC Fighter Tracking: Multi-Modal Sensing in the Octagon",
            year: "2017",
            tags: ["Computer Vision","Sensor Fusion","Sports Analytics"],
            bg: "img/projects/ufc-octagon-bg.webp",
            description: "End-to-end real-time analytics for live UFC events: stereo computer vision in the truss above the octagon, accelerometers in the gloves, GPU inference at the venue, and statistics streamed to fans worldwide. Built at AGT International in 2017 and demoed live by our CEO during Werner Vogels' keynote at AWS re:Invent 2017.",
            url: "projects/ufc-fighter-tracking.html",
        },
    {
            id: "mpi-brain-research",
            kind: "work",
            title: "MPI for Brain Research: Software for Reptilian Neuroscience",
            year: "2015 – 2017",
            tags: ["Scientific Computing","Neuroscience","Data Analysis"],
            bg: "img/projects/mpi-brain-bg.webp",
            description: "Two years as a scientific software developer in Gilles Laurent's department at the Max Planck Institute for Brain Research in Frankfurt, building MATLAB analysis pipelines and R/Shiny web apps for electrophysiologists studying sleep in bearded dragons and visual processing in ex-vivo turtle brains.",
            url: "projects/mpi-brain-research.html",
        },
    {
            id: "inevent",
            kind: "work",
            title: "inEvent: Structuring and Linking Multimedia Archives of Lectures and Meetings",
            year: "2011 – 2014",
            tags: ["Computer Vision","Video Analysis","Multimedia"],
            bg: "img/projects/inevent-bg.webp",
            description: "An EU FP7 project on indexing, searching and linking large archives of lectures, meetings and video-conferences as interconnected hyper-events. At Fraunhofer HHI I led the video-analysis side of the work — automatic segmentation, slide-transition detection and face-based features for multi-modal speaker linking — published at VISAPP 2014, Interspeech 2014, and the ACM MM 2013 Grand Challenge.",
            url: "projects/inevent.html",
        },
    {
            id: "avatech",
            kind: "work",
            title: "AVATecH: Automated Annotation of Audio/Video Corpora for Humanities Research",
            year: "2009 – 2014",
            tags: ["Computer Vision","Audio Analysis","Digital Humanities"],
            bg: "img/projects/avatech-bg.webp",
            description: "AVATecH was a joint Fraunhofer / Max Planck project that brought state-of-the-art audio and video pattern recognition into ELAN, the de-facto annotation tool used by linguists, anthropologists, and psychologists worldwide, turning weeks of manual labelling into minutes of supervised review.",
            url: "projects/avatech.html",
        }];

