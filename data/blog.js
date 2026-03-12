/* ============================================================
   BLOG POSTS  —  edit this file to add or update posts
   ============================================================

   Each entry shape:
   {
     title:   "My post title",
     date:    "2024-12-01",      // ISO date string (YYYY-MM-DD)
     excerpt: "Short summary.",
     tag:     "Research",        // shown as a coloured badge
     readMin: 7,                 // estimated read time in minutes
     url:     "blog/my-post.html" // relative or absolute URL
   }

   The newest post should appear first.
   Leave the array empty to show a "Coming soon" placeholder.
   ============================================================ */

const BLOG_POSTS = [
    {
            title: "A personal website",
            date: "2026-03-12",
            excerpt: "Creating a personal website using Claude Code. Plus, why did I choose to start a blog in 2026",
            tag: "Personal",
            readMin: 5,
            url: "blog/a-personal-website.html",
        },
    {
        title: 'Why Multi-user AR Belongs in Every Classroom',
        date: '2024-11-20',
        excerpt: 'After four large-scale pilots and hundreds of students, here is what we learned about designing collaborative XR experiences that genuinely improve learning outcomes.',
        tag: 'Research',
        readMin: 7,
        url: 'blog/multi-user-ar-classroom.html',
    },
    {
        title: 'Vision Transformers in Production: A Battle-Tested Guide',
        date: '2024-09-10',
        excerpt: 'ViT models are powerful, but shipping them has real gotchas. Here is how we brought inference time from 800 ms down to 45 ms with quantisation, smart batching, and memory layout.',
        tag: 'Engineering',
        readMin: 9,
        url: 'blog/vit-production-guide.html',
    },
    {
        title: 'Multi-modal Speaker Diarisation at Broadcast Scale',
        date: '2024-07-18',
        excerpt: 'Combining audio embeddings, lip-motion detection, and spatial cues to identify six-plus concurrent speakers in a live broadcast feed — and why the hard part is not the model.',
        tag: 'AI',
        readMin: 6,
        url: 'blog/multimodal-diarisation-broadcast.html',
    },
];
