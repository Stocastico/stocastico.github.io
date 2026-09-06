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
#   tags:        1–2 labels from the closed facet vocabulary (quoted string,
#                comma-separated). The six facets are:
#                  Computer Vision | AR & 3D | LLMs & MLOps |
#                  Media & Live Events | Education & Research | Data & Interactive
#                Anything else is rejected by new-project.js. Why the list is
#                closed is in the header of data/projects.js.
#   bg:          Hero banner on the detail page, and its og:image unless `og`
#                below overrides it. NOT a card background — project cards have
#                carried no image since the artwork proved illegible under the
#                body copy (see js/render-cards.js).
#   description: Short 2–3 sentence summary shown on the homepage card
#
# Optional:
#   og:          "img/projects/my-og.png"
#                A purpose-built social card, for when the hero is the wrong
#                shape or format for one. Platforms want 1200x630; under
#                600x315 the preview degrades to a thumbnail or vanishes, and
#                an SVG hero is not rendered by scrapers at all.
#   link_paper:  "https://link.springer.com/..."
#   link_github: "https://github.com/..."
#   link_demo:   "https://..."
#   link_video:  "https://youtube.com/..."

id:          my-project-slug
kind:        work
title:       "My Project Title"
year:        "2024"
tags:        "Computer Vision, AR & 3D"
bg:          "img/projects/my-bg.webp"
description: "Short 2–3 sentence summary shown on the homepage project card."
---

Full project description in Markdown.

Can span multiple paragraphs, include **bold**, *italic*, and [links](https://example.com).

## Technical Details

- Detail one
- Detail two

## Results

Describe outcomes, impact, or key findings.

## Images

An image on its own line becomes a `<figure>`. Width and height are read off
the file, so the page reserves the right box before it loads:

![Alt text describing what the picture shows](img/projects/my-figure.webp)

A quoted third argument adds a caption. The caption is for every reader; the
alt text is for the one who cannot see the image, so they should not be the
same sentence:

![Alt text describing what the picture shows](img/projects/my-figure.webp "What to look at in it")

An architecture diagram goes in `drafts/diagrams/` as an SVG authored with
`fill="var(--accent)"`, and is inlined with:

!svg(drafts/diagrams/my-diagram.svg)

Inline, because an external SVG is its own document and cannot read the page's
custom properties — its colours have to be baked in, and baked colours are wrong
for every palette but the one they were drawn in, including the light variant of
that one.
