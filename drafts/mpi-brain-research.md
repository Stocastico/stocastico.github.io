---
id:          mpi-brain-research
title:       "MPI for Brain Research: Software for Reptilian Neuroscience"
year:        "2015 – 2017"
tags:        "Scientific Computing, Neuroscience, Data Analysis"
thumb:       "img/projects/mpi-brain-thumb.jpeg"
bg:          "img/projects/mpi-brain-bg.jpeg"
description: "Two years as a scientific software developer in Gilles Laurent's department at the Max Planck Institute for Brain Research in Frankfurt, building MATLAB analysis pipelines and R/Shiny web apps for electrophysiologists studying sleep in bearded dragons and visual processing in ex-vivo turtle brains."
link_paper:  "https://www.science.org/doi/10.1126/science.aaf3621"
---

Between **2015 and 2017** I worked as a **Scientific Software Developer** at the **Max Planck Institute for Brain Research** in Frankfurt, in the department led by **Prof. Gilles Laurent**. I want to be precise about my role from the start: I was **not a researcher** there. I did not run experiments, design studies, or co-author the papers that came out of the lab. I was the engineer who sat next to the people doing all of that, and helped them turn their data into something they could actually look at.

What made the place extraordinary was the science the researchers were doing around me. The Laurent lab studies the function and dynamics of neuronal circuits, with a particular interest in **non-mammalian vertebrates** — reptiles and cephalopods — as windows into the deep evolutionary origins of the brain. In the two years I was there, I had a front-row seat to two projects that I still describe to people whenever the conversation turns to "the most interesting thing you've ever worked on".

## Sleep in Bearded Dragons

The first was the Pogona sleep work. *Pogona vitticeps*, the **Australian central bearded dragon**, was the unlikely star of the lab. For decades, the textbook story had been that the two sleep states familiar to us — **slow-wave sleep** and **REM sleep** — were a mammalian (and avian) invention. Reptiles slept, but they did not have those characteristic alternating brain rhythms. Or so it was thought.

To test this properly, the experimental team needed long, continuous, high-quality recordings from the brains of awake and sleeping animals. The setup was very cool and straight from science fiction (at least for me): the dragons were fitted with what we called **"the hat"**: a small custom-built headstage cemented to the skull, from which thin cables emerged carrying signals from **silicon probes implanted deep in the brain** (in the dorsal ventricular ridge, the reptilian analogue of cortex). The animals lived their normal lives in their tanks while the system recorded **for weeks at a time**, capturing every nap, every overnight sleep cycle, every transition between states.

The signals revealed two regular oscillating brain states alternating with a period of roughly **80 seconds**, repeating for **6 to 10 hours every night** — the reptilian equivalents of slow-wave and REM sleep. The paper, *"Slow waves, sharp waves, ripples, and REM in sleeping dragons"*, appeared in **Science** in 2016 and pushed the likely evolutionary origin of these sleep dynamics back at least to the common amniote ancestor of mammals, birds, and reptiles, more than 300 million years ago.

## Moving Images in a Turtle Brain on a Slide

The second project was, if anything, even stranger. The lab also worked on the **visual cortex of the turtle**. Turtle brain tissue has an unusual property that makes it priceless to neuroscientists: **it remains alive and electrophysiologically active for days after the animal is sacrificed**, kept in oxygenated artificial cerebrospinal fluid. This is much harder to do with mammalian tissue, which deteriorates quickly.

The researchers exploited this to build something that on first hearing sounds vaguely science-fiction. They prepared **whole isolated turtle brains, with the eyes still attached via the optic nerve**, in a recording chamber. They then **showed moving visual stimuli to the eyes of the disembodied preparation** — drifting bars, gratings, natural scenes — and recorded from the cortex as the visual signals propagated in. In other preparations they worked with brain slices in which the visual cortex was still wired up enough to respond to direct stimulation.

The headline result is in the paper *"Spatial Information in a Non-retinotopic Visual Cortex"* (Fournier, Müller, Schneider, Hemberger, and Laurent, *Neuron*, 2018), based on data collected in the period I was there. It showed that the turtle visual cortex represents space in a way that is **not retinotopic** — neighbouring points in the visual field are not represented by neighbouring neurons, in contrast to mammalian primary visual cortex. Instead, spatial information is distributed across the cortex in a more mixed, sequence-like fashion. It is one of those findings that quietly destabilises the neat picture in the textbooks.

## What I Actually Did

My job description was much more mundane than the science, but it was indispensable to it.

- **MATLAB analysis code.** Most of the lab's electrophysiology pipeline lived in MATLAB. I helped develop scripts and functions depending on the researcher needs
- **Web apps in R / Shiny.** Several of the lab's analysis dashboards were built in **R with Shiny**: interactive visualisations of long electrophysiology recordings that let researchers scrub through nights of sleep data, mark interesting events, compare animals, and pull statistics on the fly without having to write a fresh script every time. Building those felt closer to product engineering than to research, and was very much my comfort zone.
- **Development best practices.** As an expert developer I was tasked with providing training and teaching how to write clean code and apply devops practices that guarantee reproducibility and simplify maintenance of the codebase

## Personal Reflection

It was the only stretch of my career spent embedded in an academic neuroscience environment, and it shaped me more than the line on my CV suggests. Watching the researchers **frame questions, design experiments, argue at lab meetings, and refuse to overinterpret a clean-looking plot** was a quiet education in scientific taste — the kind of taste that does not transfer to engineering directly but informs it permanently.

It also clarified something about my own preferences. I love being close to research. I also love shipping things that other people use. The role of *scientific software developer* — not a PI, not a postdoc, but the engineer who makes the science move faster — is a genuinely good (and difficult!) role, and one that I think research institutes generally underinvest in.
