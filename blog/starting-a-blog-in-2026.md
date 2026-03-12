---
title: "A personal website"
date: "2026-03-12"
excerpt: "Creating a personal website using Claude Code. Plus, why did I choose to start a blog in 2026"
tag: "Personal"
readMin: 5
---

## Introduction

Thanks to 

## Main Section

Organize your content with clear headings and logical flow. You can use standard Markdown formatting:

- **Bold text** for emphasis
- *Italic text* for additional context
- `inline code` for technical terms
- [Links](https://example.com) to external resources

### Subsection

Break down complex ideas into clear subsections with descriptive headings.

## Code Examples

Use code blocks for technical content:

```javascript
// JavaScript example
function greeting(name) {
  console.log(`Hello, ${name}!`);
}
```

```python
# Python example
def greeting(name):
    print(f"Hello, {name}!")
```

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
