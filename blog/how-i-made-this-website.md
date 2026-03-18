---
title: "Your Post Title Here"
date: "2024-03-09"
excerpt: "A concise summary of your post that will appear on the blog index. Keep it brief and engaging."
tag: "Research"
readMin: 5
lead: "Optional: An opening sentence or hook that appears in large text at the beginning of the post."
image: "img/pixel-art-sleepless-developer.png"
---

![Pixel art of a tired developer holding a baby at 3:47 AM, with a thought bubble showing software architecture diagrams](../img/pixel-art-sleepless-developer.png)

## Introduction

Start your post with an engaging introduction that sets up the main idea or problem you're addressing.

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
