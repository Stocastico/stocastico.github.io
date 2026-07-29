---
# Duplicate this file and fill in the values below.
# Run: node scripts/new-project.js <this-file.md> [--dry-run]
# Output: projects/<id>.html (standalone detail page) + entry in data/projects.js
#
# Required:
#   id:          kebab-case identifier, becomes the HTML filename
#   kind:        work | personal. 'work' is professional or research work and
#                is what the homepage shows; 'personal' is a side project — it
#                gets a badge on its card and never appears on the homepage.
#                No default: leaving it out fails the script.
#   title:       Project title (quoted string)
#   year:        Project year (quoted string)
#   tags:        Comma-separated keywords, 1–3 (quoted string)
#   bg:          Path to image used semi-transparently behind the homepage
#                card AND as the hero banner on the detail page.
#   description: Short 2–3 sentence summary shown on the homepage card
#
# Optional:
#   link_paper:  "https://link.springer.com/..."
#   link_github: "https://github.com/..."
#   link_demo:   "https://..."
#   link_video:  "https://youtube.com/..."

id:          my-project-slug
kind:        work
title:       "My Project Title"
year:        "2024"
tags:        "AI, Computer Vision"
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
