---
# Duplicate this file and fill in the values below.
# Run: node scripts/new-project.js <this-file.md> [--dry-run]
# Output: projects/<id>.html (standalone detail page) + entry in data/projects.js
#
# Required:
#   id:          kebab-case identifier, becomes the HTML filename
#   title:       Project title (quoted string)
#   year:        Project year (quoted string)
#   tags:        Comma-separated keywords, 1–3 (quoted string)
#   thumb:       Path to 16:9 thumbnail (used as card bg if `bg` is omitted)
#   description: Short 2–3 sentence summary shown on the homepage card
#
# Optional:
#   bg:          Path to a background image used semi-transparently behind
#                the homepage card AND as the hero banner on the detail page.
#                Falls back to `thumb` when omitted.
#   link_paper:  "https://link.springer.com/..."
#   link_github: "https://github.com/..."
#   link_demo:   "https://..."
#   link_video:  "https://youtube.com/..."

id:          my-project-slug
title:       "My Project Title"
year:        "2024"
tags:        "AI, Computer Vision"
thumb:       "img/projects/my-thumb.jpg"
bg:          "img/projects/my-bg.jpg"
description: "Short 2–3 sentence summary shown on the homepage project card."
---

Full project description in Markdown.

Can span multiple paragraphs, include **bold**, *italic*, and [links](https://example.com).

## Technical Details

- Detail one
- Detail two

## Results

Describe outcomes, impact, or key findings.
