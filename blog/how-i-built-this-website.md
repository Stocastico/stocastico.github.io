---
title: "How I Built This Website While My Baby Slept (Sort Of)"
date: "2026-03-20"
excerpt: "Building a personal site with Claude Code mobile app while I am trying to keep my baby asleep. From design to iterative workflows, and what I learned about AI-assisted development."
tag: "AI"
readMin: 5
lead: "If you're reading this, you're looking at a website that was built almost entirely at night, with an iPhone."
image: img/pixel-art-sleepless-developer.png
---

*If you just want to know the technical details, check the repo's [README](https://github.com/Stocastico/stocastico.github.io/blob/main/README.md). Otherwise, keep reading.*

## The 3 AM Coding Sessions

The last few months have been tough. We have been blessed by the arrival of a beautiful baby boy... He brightens our days with his smile, but he also makes us miserable at night, since apparently he doesn't like sleeping more than 40 minutes in a row.
As I spent hours awake at night holding my son, sleep deprivation made me think that it was a good idea to try creating a personal website with the help of [Claude Code](https://claude.ai/code).

The trick was the Claude iPhone app. I could define what I wanted, describe layouts, request features or debug content from my phone: no laptop needed, no VS Code, I didn't even have to pay that much attention, really.

## Starting With a Vision

I had only a rough idea of what I wanted to build: I wanted something modern, I wanted [Three.js](https://threejs.org/) and I wanted it to reflect what I actually do professionally: AI, computer vision, my previous career in applied research and my current role as manager and AI engineer.
I started defining the content structure, the sections, the visual effects, asking Claude for feedback on every weird idea I had, and looking at other personal websites I like for inspiration.

## The Iteration Loop

Here's what the workflow looked like in practice: at night, I'd work with Claude Code to write and refine code. Once every few days, I would check the results in the browser while having breakfast and write down my findings: bugs, things I liked and things to improve. Then the following night, I'd feed those observations back to Claude.

It was probably a very slow iteration cycle compared to what a professional web developer could do, but honestly it worked very well for me, as it allowed me to create something I would have never had time for.

## Polishing With AI

Once the core structure was solid and I was happy with how things looked, I started filling the content and adding text. To speed things up I passed my CV and my online profiles (LinkedIn and GScholar) to Claude and asked it to fill the relevant sections. Then, I switched to [GitHub](https://github.com/Stocastico/stocastico.github.io) (where the source code is hosted) and edited the text. This was probably the most time consuming part, as I don't really like Claude writing style.

Then I did something that turned out to be really valuable: I asked [Claude Opus](https://www.anthropic.com/claude) to do a full review of the entire site. Not just the code — everything. UI consistency, UX flow, performance issues, missing content, accessibility gaps. It was like having a very thorough (and very patient) colleague do a design review.

We went through several rounds of fixes and improvements based on that analysis. I had to be careful about Claude's tendency to always please the user (sycophancy, I believe, is the correct term) but once I found the right prompt Claude was able to find (and fix!) many issues, bugs or general code smells. It even suggested adding a blog (which you are reading right now) and separating the long CV section to a different page. Overall I was quite impressed with what Claude was able to do on top of just writing the code.

## The Final Touches

The last phase was adding the more complex visual content — the 3D globe, the interactive map of Europe, things that may look a bit cringe 😅 but I really wanted to add. These took more back-and-forth to get right, but even so, something that would have taken me ages on my own.

Before going live, I then asked a few people to take a look and give honest feedback. Their comments were probably too nice and polite, but all their suggestions made sense, so I asked Claude to implement them as well.

And here we are. You're reading the result.

## What I Learned

A few takeaways, in case they're useful to anyone. As this is AI, this could become obsolete very soon, but at least now (March 2026) it makes sense to me:

- **AI-assisted coding on mobile is genuinely viable.** Not for everything, but for a surprising amount of work. The constraint of working from a phone actually forced me to think more clearly about what I wanted before asking for it.
- **Forced slow iteration isn't always bad.** When you can only work in short bursts, you end up being more deliberate. Less "let me just quickly try this" and more "let me think about what actually matters."
- **Use AI for review, not just generation.** The most valuable thing wasn't having Claude write code for me — it was having it critically review everything and point out what I'd missed.

*BTW: this post was written by me but I asked Claude to fix typos and add a couple of links I missed.*
