/* ─────────────────────────────────────────────────────────────────────────────
   Curriculum Vitae data — edit this file to keep your CV up to date.

   CV_CAREER    work history, newest entry first
   CV_EDUCATION academic history, newest entry first
   CV_SKILLS    { technical, leadership, languages } skill data

   Fields:
     CV_CAREER entries:
       year         string  e.g. "2022 – present"
       role         string  job title
       company      string  employer / organisation
       location     string  city, country  (optional)
       description  string  one or two sentences  (optional)
       tags         array   short skill labels

     CV_EDUCATION entries:
       year         string  e.g. "2014 – 2017"
       degree       string  full degree name
       institution  string  university / school
       location     string  city, country  (optional)
       description  string  thesis or honours note  (optional)

     CV_SKILLS.technical  / .leadership  entries:
       name   string  skill label
       level  number  0–100 (rendered as a filled progress bar)

     CV_SKILLS.languages entries:
       name         string  language name
       proficiency  string  CEFR level or plain description
──────────────────────────────────────────────────────────────────────────────*/

/* ── Career ───────────────────────────────────────────────── */
const CV_CAREER = [
  {
    year:        '2020 – present',
    role:        'Senior Researcher — AI & Media Technology',
    company:     'Vicomtech',
    location:    'San Sebastián, ES',
    description: 'Leading applied AI research in computer vision, multimodal media analysis, and interactive AR systems within EU-funded projects. Technical lead for the CLEAR multi-user AR platform deployed across schools in five European countries.',
    tags:        ['PyTorch', 'Computer Vision', 'Augmented Reality', 'EU Projects', 'Team Lead'],
  },
  {
    year:        '2017 – 2020',
    role:        'Research Engineer — Computer Vision',
    company:     'Vicomtech',
    location:    'San Sebastián, ES',
    description: 'Built end-to-end video understanding pipelines for broadcast and educational media: speaker diarisation, lecture segmentation, and audience engagement measurement at scale.',
    tags:        ['TensorFlow', 'OpenCV', 'Video Analysis', 'Speaker Diarisation'],
  },
  {
    year:        '2014 – 2017',
    role:        'PhD Researcher',
    company:     'University of the Basque Country (UPV/EHU)',
    location:    'Bilbao, ES',
    description: 'Research on real-time 3D scene reconstruction and semantic segmentation using deep learning and RGB-D point-cloud data.',
    tags:        ['Deep Learning', '3D Vision', 'Point Clouds', 'Keras'],
  },
];

/* ── Education ────────────────────────────────────────────── */
const CV_EDUCATION = [
  {
    year:        '2014 – 2017',
    degree:      'PhD — Computer Vision',
    institution: 'University of the Basque Country (UPV/EHU)',
    location:    'Bilbao, ES',
    description: 'Thesis: "Real-time semantic 3D reconstruction for indoor scene understanding." Graduated with international doctorate mention.',
  },
  {
    year:        '2012 – 2014',
    degree:      'MSc — Computer Engineering',
    institution: 'Università degli Studi di Brescia',
    location:    'Brescia, IT',
    description: 'Specialisation in Artificial Intelligence and Robotics. Graduated with honours (110 cum laude / 110).',
  },
  {
    year:        '2009 – 2012',
    degree:      'BSc — Information Engineering',
    institution: 'Università degli Studi di Brescia',
    location:    'Brescia, IT',
    description: '',
  },
];

/* ── Skills ───────────────────────────────────────────────── */
const CV_SKILLS = {
  technical: [
    { name: 'Python · PyTorch · TensorFlow',              level: 95 },
    { name: 'Computer Vision & 3D Perception',            level: 92 },
    { name: 'Augmented Reality (ARCore · ARKit · WebXR)', level: 86 },
    { name: 'MLOps · Docker · CI/CD',                     level: 78 },
    { name: 'C++ · OpenCV · CUDA',                        level: 72 },
    { name: 'Web · JavaScript · Three.js · WebGL',        level: 70 },
  ],
  leadership: [
    { name: 'Technical roadmap & system architecture', level: 90 },
    { name: 'EU project management & reporting',       level: 88 },
    { name: 'Research mentoring & supervision',        level: 82 },
    { name: 'Stakeholder & partner communication',     level: 85 },
  ],
  languages: [
    { name: 'Italian',  proficiency: 'Native'             },
    { name: 'English',  proficiency: 'C2 — Proficient'    },
    { name: 'Spanish',  proficiency: 'B2 — Upper-Intermediate' },
    { name: 'Basque',   proficiency: 'A2 — Elementary'    },
  ],
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CV_CAREER, CV_EDUCATION, CV_SKILLS };
}
