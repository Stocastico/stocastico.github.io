---
id:          inevent
title:       "inEvent: Structuring and Linking Multimedia Archives of Lectures and Meetings"
year:        "2011 – 2014"
tags:        "Computer Vision, Video Analysis, Multimedia"
bg:          "img/projects/inevent-bg.webp"
description: "An EU FP7 project on indexing, searching and linking large archives of lectures, meetings and video-conferences as interconnected hyper-events. At Fraunhofer HHI I led the video-analysis side of the work — automatic segmentation, slide-transition detection and face-based features for multi-modal speaker linking — published at VISAPP 2014, Interspeech 2014, and the ACM MM 2013 Grand Challenge."
link_paper:  "https://www.scitepress.org/Papers/2014/46860/"
---

**inEvent** (*Accessing Dynamic Networked Multimedia Events*, FP7 grant agreement **287872**) was a three-year European research project running from **November 2011 to November 2014**, coordinated by the **[Idiap Research Institute](https://www.idiap.ch/en)** in Switzerland. The consortium brought together six partners — three industrial and three research — including **Idiap**, **[EPFL](https://www.epfl.ch/en/)**, the **[University of Edinburgh](https://www.ed.ac.uk/)**, **[IBM Research](https://research.ibm.com/)**, the Swiss webcasting company **Klewel**, and **[Fraunhofer HHI](https://www.hhi.fraunhofer.de/en.html)**, where I worked during the entire run of the project.

The premise was straightforward to state and substantially harder to deliver. Universities, conference organisers and large enterprises were sitting on growing archives of long-form video — lecture recordings, all-hands meetings, panel sessions, video-conferences — and had almost no way of using them. A four-hour recording with no internal structure is, for practical purposes, opaque: nobody is going to scrub through it to find the three minutes that matter. inEvent's goal was to break recordings of this kind into rich, interconnected **hyper-events** — segments that carry their own metadata, link to one another across recordings, and become searchable, browsable and recommendable.

## My Role

I worked on the project at **Fraunhofer Heinrich-Hertz-Institut (HHI)** in Berlin, in the group led by **Oliver Schreer**, which was the adjunct leader of **WP2 — Analysis and Metadata**. HHI's mandate inside the consortium was the video side of the analysis pipeline: visual event detection, person detection, human motion analysis, feature extraction and tracking. Audio analysis (speech recognition, speaker diarization, prosody) was the responsibility of Idiap and the University of Edinburgh; we owned what could be derived from the pixels.

My contribution sat squarely inside that video work. The same Fraunhofer cluster of EU projects produced [AVATecH](avatech.html), which targeted humanities researchers, and inEvent, which targeted lectures, meetings and conferences. Some of the underlying machinery overlapped — shot detection, person localisation — but the framing was different. inEvent was about turning long recordings into a navigable index; AVATecH was about pre-annotating field material for manual review.

## What "Hyper-events" Meant in Practice

The unit of analysis in inEvent was not the recording, and not the shot, but the **event** — a coherent stretch of activity within a recording. A typical 90-minute conference talk might naturally decompose into:

- An introduction by the chair (speaker A, on a podium, no slides).
- The body of the talk (speaker B, slides changing every ~60 seconds, occasional animated content embedded in the slides).
- An interactive demo segment (speaker B, no slides, action in front of the camera).
- A Q&A session (multiple speakers, audience microphones, back-and-forth).

Each of those is an "event" with its own metadata: who spoke, what was on screen, what changed and when. **Hyper-events** are what you get when you link them — to other events inside the same recording (this Q&A answers a question raised during the demo), to events in different recordings (this speaker also gave a related talk at a different conference), and to external resources (the slide deck, the speaker's bio, the cited papers). Indexing the archive at that resolution is what makes it useful instead of just searchable by filename.

## The Video Side

The visual analysis at HHI fed two parts of the larger pipeline: **structural segmentation** of the recording into the kinds of events above, and **content-level analysis** of presentation segments so that the slide layer became its own searchable surface.

**Frame-level classification.** I worked on a classifier that labelled each video frame as one of four categories — *talk*, *presentation*, *blackboard*, or *mix* (combinations of the above, e.g. picture-in-picture). The model was an **SVM** trained on colour and facial features extracted from several hundred hours of lecture and conference video, and it ran frame by frame rather than relying on a pre-computed shot-cut segmentation. A temporal smoothing pass every 50 frames cleaned up the output so the resulting segmentation was stable enough to be useful downstream. The deliberate decision to skip shot-cut detection — counter-intuitive at the time — paid off on the typical inEvent material, where shot cuts inside a long talk are rare and often absent, and where the relevant boundaries are visual-content changes rather than camera changes.

**Slide-level analysis.** Inside any segment labelled *presentation*, a second stage analysed the slide layer specifically: when did the slide change, when did an animation play, when did embedded video begin and end. The output was a second, finer-grained timeline that sat under the structural one — pointing at the slide *N* boundary inside the presentation segment that started at minute 27. For a downstream search system, this is what makes it possible to land directly on the moment the answer appeared on screen, rather than on the start of a long talk.

**Face features for speaker linking.** A separate strand of the work used the visual side to help the audio side. Speaker diarization — *who spoke when* — is hard enough inside a single recording, and gets much harder when you want to link the same speaker across many recordings in an archive. Audio-only systems are sensitive to channel and acoustic conditions, which vary wildly between rooms, microphones and recording dates. We collaborated with the Idiap team on a **multi-modal speaker-linking** system that combined audio-side speaker embeddings with **face features** extracted from the video at the speech segments — clustering speakers in a joint audio-visual space so that the same person showing up two months later in a different room could still be recognised. The system was evaluated on the **[AMI meeting corpus](https://groups.inf.ed.ac.uk/ami/corpus/)** (over a hundred meetings) and reported within-recording and across-recording diarization error rates. The work was published as **"Diarizing Large Corpora using Multi-modal Speaker Linking"** (Ferràs, Masneri, Schreer, Bourlard) at **Interspeech 2014** in Singapore.

The video work I led directly was disseminated through **"SVM-based Video Segmentation and Annotation of Lectures and Conferences"** (Masneri, Schreer) at the **9th International Conference on Computer Vision Theory and Applications (VISAPP 2014)** in Lisbon. An earlier joint contribution with the Idiap team — the **MUST-VIS** system — went to the **MediaMixer / VideoLectures.NET Grand Challenge at ACM Multimedia 2013** in Barcelona, where video-side cues (writing on a blackboard, presence of a speaker, slide changes) were fused with audio-side cues (ASR-based topic boundaries) to produce a multi-factor temporal segmentation visualised as keyword-cloud timelines.

## Technical Context

inEvent ran in 2011–2014, on the cusp of the transition from hand-crafted features to learned representations. The work I did sat squarely on the hand-crafted-features side of that divide: colour statistics, facial detectors, edge-based motion descriptors, SVMs. A 2026 re-implementation of the same problem would put a transformer-based vision-language model in roughly a tenth of the code and arrive at better numbers, and that is fine; what does not date is the **problem framing** — recording → events → linked events → search and recommendation — which is what the project was really about.

The practical constraints were as instructive as the algorithms. The target deployment was inside Klewel's webcasting product and inside Idiap's research-archive tooling; both meant the algorithms had to run on commodity machines, in something close to real time, on long recordings, with reasonable memory. Frame-by-frame SVM on simple features fits those constraints comfortably. A deep model would not have, in 2013.

## Outcomes

By the end of the project, the video analysis modules I worked on were integrated into the broader inEvent processing chain and contributed to demos shown to the EC reviewers and to industrial visitors at HHI and Idiap. The lecture-segmentation work fed directly into the **Klewel** webcasting backend — the kind of "research transferred into a product" outcome that EU framework projects optimise for and rarely actually achieve. On the academic side, the work was disseminated through VISAPP and the ACM MM Grand Challenge as outlined above.

What I took away from inEvent, beyond the algorithms, was the experience of working at the boundary between **video analysis** and **multimodal indexing**. The video side does not stand alone — the boundaries we detected only became *meaningful* events once they were aligned with the speech-side cues from Idiap and Edinburgh, and the linking layer that EPFL and IBM built on top. That collaboration shape — domain experts on each modality, a thin coherent meeting point in the middle — is the one I have come back to in every project since.
