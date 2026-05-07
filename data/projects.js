/* ============================================================
   PROJECTS  —  edit this file to add or update project cards
   ============================================================

   Each entry shape:
   {
     id:          'my-project',               // kebab-case, used as HTML anchor
     title:       'My Project Title',         // short title (one line)
     year:        '2024',                     // project year (string)
     tags:        ['AI', 'CV'],               // 1–3 keyword badges
     thumb:       'img/projects/my-thumb.jpg',// 16:9 thumbnail path
     description: 'Short 2–3 sentence summary shown on the homepage card.',
     url:         'projects.html#my-project', // link to detail section
   }

   The newest project should appear first.
   The homepage shows up to 3 projects; the rest appear only on projects.html.
   ============================================================ */

export const PROJECTS = [
    {
            id: "mpi-brain-research",
            title: "MPI for Brain Research: Software for Reptilian Neuroscience",
            year: "2015 – 2017",
            tags: ["Scientific Computing","Neuroscience","Data Analysis"],
            thumb: "img/projects/mpi-brain-thumb.webp",
            bg: "img/projects/mpi-brain-bg.jpeg",
            description: "Two years as a scientific software developer in Gilles Laurent's department at the Max Planck Institute for Brain Research in Frankfurt, building MATLAB analysis pipelines and R/Shiny web apps for electrophysiologists studying sleep in bearded dragons and visual processing in ex-vivo turtle brains.",
            url: "projects/mpi-brain-research.html",
        },
    {
            id: "traction",
            title: "TRACTION: Opera Co-creation for Social Transformation",
            year: "2020 – 2022",
            tags: ["Web Application","Co-creation","Social Inclusion"],
            thumb: "img/projects/traction-thumb.png",
            bg: "img/projects/traction-bg.jpg",
            description: "TRACTION was a Horizon 2020 project, coordinated by Vicomtech, that used opera as a vehicle for social inclusion. My work centred on the Co-creation Stage — the real-time distributed performance tool — spanning development, user-requirements gathering, evaluation, and direct engagement with artistic and community partners across Barcelona, Leiria and Ireland.",
            url: "projects/traction.html",
        },
    {
            id: "aroundtheworld",
            title: "ARoundTheWorld: Collaborative AR for Education",
            year: "2024",
            tags: ["AR","Education","User Study"],
            thumb: "img/projects/ARound_the_world_1.png",
            bg: "img/projects/ARound_the_world_2.png",
            description: "ARoundTheWorld is a multiplatform collaborative AR geography application built on the cleAR architecture. It was evaluated with 44 students across three schools and represents the final paper of my PhD, validating that the architecture can produce applications that integrate seamlessly into existing school curricula.",
            url: "projects/aroundtheworld.html",
        },
    {
            id: "clear-architecture",
            title: "cleAR: Interoperable Architecture for Multi-User AR",
            year: "2023",
            tags: ["AR","Education","Architecture"],
            thumb: "img/projects/clear-architecture.jpg",
            bg: "img/projects/clear-architecture.jpg",
            description: "cleAR is a modular, interoperable architecture for building multi-user augmented reality applications in education. Designed from the ground up to bridge the gap between AR's potential and its limited classroom adoption, it was the core contribution of my PhD research.",
            url: "projects/clear-architecture.html",
        },
    {
            id: "rag-document-qa",
            title: "RAG Document Assistant for Financial Services",
            year: "2023",
            tags: ["RAG","LLM","NLP"],
            thumb: "img/projects/rag-query.svg",
            bg: "img/projects/rag-query.svg",
            description: "A retrieval-augmented generation system built for a large European bank, replacing manual SharePoint search with a conversational assistant that answers questions and cites the exact document and page where each answer was found.",
            url: "projects/rag-document-qa.html",
        },
    {
            id: "audience-engagement",
            title: "Multi-modal Audience Engagement Measurement System",
            year: "2020",
            tags: ["Computer Vision","Multi-modal Sensing","Live Events"],
            thumb: "img/projects/audience-engagement-thumb.webp",
            bg: "img/projects/audience-engagement-bg.webp",
            description: "A multi-modal system that measures audience engagement at live events by fusing computer vision with WiFi/Bluetooth signal analysis. Designed, implemented, and validated at Vicomtech in 2020, and released as open-source software.",
            url: "projects/audience-engagement.html",
        },
    {
            id: "ufc-fighter-tracking",
            title: "UFC Fighter Tracking: Multi-Modal Sensing in the Octagon",
            year: "2017",
            tags: ["Computer Vision","Sensor Fusion","Sports Analytics"],
            thumb: "img/projects/ufc-octagon-thumb.webp",
            bg: "img/projects/ufc-octagon-bg.webp",
            description: "End-to-end real-time analytics for live UFC events: stereo computer vision in the truss above the octagon, accelerometers in the gloves, GPU inference at the venue, and statistics streamed to fans worldwide. Built at AGT International in 2017 and demoed live by our CEO during Werner Vogels' keynote at AWS re:Invent 2017.",
            url: "projects/ufc-fighter-tracking.html",
        },
    {
            id: "avatech",
            title: "AVATecH: Automated Annotation of Audio/Video Corpora for Humanities Research",
            year: "2009 – 2014",
            tags: ["Computer Vision","Audio Analysis","Digital Humanities"],
            thumb: "img/projects/avatech-thumb.jpg",
            bg: "img/projects/avatech-bg.jpg",
            description: "AVATecH was a joint Fraunhofer / Max Planck project that brought state-of-the-art audio and video pattern recognition into ELAN — the de-facto annotation tool used by linguists, anthropologists, and psychologists worldwide — turning weeks of manual labelling into minutes of supervised review.",
            url: "projects/avatech.html",
        }];

if (typeof globalThis !== 'undefined') globalThis.PROJECTS = PROJECTS;
