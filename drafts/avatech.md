---
id:          avatech
title:       "AVATecH: Automated Annotation of Audio/Video Corpora for Humanities Research"
year:        "2009 – 2014"
tags:        "Computer Vision, Audio Analysis, Digital Humanities"
bg:       "img/projects/avatech-thumb.webp"
bg:          "img/projects/avatech-bg.webp"
description: "AVATecH was a joint Fraunhofer / Max Planck project that brought state-of-the-art audio and video pattern recognition into ELAN — the de-facto annotation tool used by linguists, anthropologists, and psychologists worldwide — turning weeks of manual labelling into minutes of supervised review."
link_paper:  "https://aclanthology.org/L12-1137/"
---

AVATecH (**A**udio-**V**isual **T**echnology for **H**umanities Research) was a multi-year research project I worked on at **[Fraunhofer Heinrich-Hertz-Institut](https://www.hhi.fraunhofer.de/en/index.html) (HHI)** between **2009 and 2014**, in collaboration with the **[Max Planck Institute for Psycholinguistics](https://www.mpi.nl/) (MPI Nijmegen)** and **[Fraunhofer IAIS](https://www.iais.fraunhofer.de/en.html)**. It was my first major research contribution after joining HHI, and it defined the direction of my early career: applying computer vision and audio analysis to problems outside the traditional media-tech industry.

The problem was simple to state and painful to live with. Researchers in linguistics, sign-language studies, child-development psychology, and anthropology depend on annotated audio-visual recordings: transcriptions of speech, boundaries of gestures, phases of interaction, participant labels. Creating those annotations by hand takes between **50 and 100 times the length of the media itself**. A single one-hour field recording could take a PhD student two full weeks to annotate. Corpora of hundreds of hours were common, and every new study needed fresh annotations.

AVATecH set out to reduce that burden by automating the most mechanical parts of the annotation pipeline — not to replace the researcher, but to pre-annotate the material so the human expert could focus on correction and semantic judgement rather than clicking through silent segments of video.

## Approach

The project produced a suite of **audio and video recognizers** — independent, pluggable modules — that were integrated into **[ELAN](https://archive.mpi.nl/tla/elan)**, the multi-tier annotation tool developed at MPI and used by thousands of humanities researchers worldwide. ELAN was extended with a generic recognizer API described in XML, so each algorithm could be invoked from inside the tool, run on the loaded media, and return tiers of tentative annotations that the user could accept, edit, or reject.

Among the recognizers delivered:

- **Shot-boundary detection** — segmenting raw video into visually coherent units, essential for any downstream analysis of filmed interviews or field recordings.
- **Speech activity detection** — fine-grained segmentation of audio into speech / non-speech regions, independent of language. Critical for field recordings where languages may be under-documented and no speech-recognition model exists.
- **Speaker clustering** — grouping speech segments by speaker identity without prior enrollment, so researchers studying turn-taking or dialogue structure could start from automatic speaker diarization.
- **Lecture and conference video segmentation** — SVM-based structuring of long-form educational recordings, published separately at VISAPP 2014.

The recognizers were designed as **modular components with adaptation and feedback mechanisms**: the researcher's corrections could be fed back into the models, allowing them to adapt to the often unusual acoustic and visual conditions of humanities field data (low-quality recordings, overlapping speech, non-standard camera placements).

## Technical Context

The project ran during a period in which audio and video analysis was transitioning from hand-crafted features to learned representations — pre-deep-learning era. The speech and speaker modules relied on MFCC features, GMM/HMM acoustic models, and clustering algorithms; the video modules used colour histograms, motion vectors, and SVM classifiers. Every recognizer had to run acceptably fast on a standard researcher laptop — no GPUs, no cloud.

Making all of that **integrate cleanly into a tool users already knew and trusted** was as much of the work as the algorithms themselves. ELAN had an established user base and a very specific interaction model; any pre-annotations had to slot into that model without disrupting existing workflows.

## Publications and Impact

The work produced several peer-reviewed papers, including:

- *AVATecH: Audio/Video Technology for Humanities Research* — LREC Workshop on Language Technologies for Digital Humanities, Hissar, Bulgaria, **2011**.
- *AVATecH — Automated Annotation Through Audio and Video Analysis* — LREC 2012, Istanbul.
- *Application of Audio and Video Processing Methods for Language Research and Documentation: The AVATecH Project* — book chapter in *Human Language Technology Challenges for Computer Science and Linguistics*, Springer, **2014**.
- *SVM-based Video Segmentation and Annotation of Lectures and Conferences* — VISAPP **2014**.

The recognizers shipped as part of **ELAN** and remained part of the tool's standard distribution for years. For a young engineer, seeing work that started as algorithm research end up in the daily workflow of humanities researchers in dozens of institutions was a lasting lesson: **the technical contribution matters only as much as its path into the hands of the people who need it**.

## Personal Reflection

AVATecH shaped my approach to every project that followed. The constraints of the problem — messy real-world data, domain experts who are not programmers, a tool ecosystem that already exists, evaluation metrics that must reflect real usefulness rather than benchmark performance — are the same constraints I have met again and again, in AR for education and later in GenAI for enterprise. The specific algorithms have aged (a modern version of almost every recognizer would be built on transformer-based models in a tenth of the code), but the engineering discipline of the project has not.
