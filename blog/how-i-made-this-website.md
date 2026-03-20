---
title: "Hoe I built this website"
date: "2024-03-19"
excerpt: "The weird experience of building a product in bed, from my phone ."
tag: "AI"
readMin: 5
lead: "AIs like Claude or ChatGPT enable us to do things we didn't imagine possible just a year ago."
image: "img/pixel-art-sleepless-developer.png"
---

![Pixel art of a tired developer holding a baby at 3:47 AM, with a thought bubble showing software architecture diagrams](../img/pixel-art-sleepless-developer.png)

## Night sessions

The laste few months have been tough. We have been blessed by the arrival of a beautiful baby boy... He brightens our days eith his smile

## Main Section

Organize your content with clear headings and logical flow. You can use standard Markdown formatting:

- **Bold text** for emphasis
- *Italic text* for additional context
- [Links](https://example.com) to external resources

### Subsection

Break down complex ideas into clear subsections with descriptive headings.

## Lists and Quotes

You can use ordered and unordered lists:

1. First point
2. Second point
3. Third point

Or blockquotes for important statements:

> This is an important quote or key takeaway from your research or experience.

## Conclusion

Wrap up your post with a conclusion that summarizes the main points and suggests next steps or implications.

---

## Frontmatter Guide

**Required fields:**

- `title` — Main heading of your post
- `date` — Publication date in ISO format (YYYY-MM-DD)
- `excerpt` — Short summary for the blog index (1-2 sentences)
- `tag` — Badge category (e.g., "Research", "Engineering", "AI", "Education")
- `readMin` — Estimated reading time in minutes

**Optional fields:**

- `lead` — Large opening text that appears before the body
- `url` — Custom HTML filename (e.g., "blog/custom-post.html")

**To publish:** Run `node scripts/new-post.js your-file.md`
