---
id:          audience-engagement
title:       "Multi-modal Audience Engagement Measurement System"
year:        "2020"
tags:        "Computer Vision, Multi-modal Sensing, Live Events"
thumb:       "img/projects/audience_engagement_thumb.jpg"
bg:          "img/projects/audience-engagement-bg.png"
description: "A multi-modal system that measures audience engagement at live events by fusing computer vision with WiFi/Bluetooth signal analysis. Designed, implemented, and validated at Vicomtech in 2020, and released as open-source software."
link_paper:  "https://link.springer.com/chapter/10.1007/978-3-030-71158-0_17"
link_code:   "https://github.com/tv-vicomtech/AudienceEngagement"
---

How do you know whether an audience is actually paying attention? For a conference organiser, a museum curator, or a retail-space operator, the question matters: did people show up and engage, or did they walk past? Existing answers relied on either expensive, intrusive sensors or proxy metrics (ticket sales, post-event surveys) that say nothing about what happened in the room.

This project, carried out at **Vicomtech** in **2020** and published at **ICAART 2020** (Sanz-Narrillos, Masneri, Zorrilla — *"A Multi-modal Audience Engagement Measurement System"*), proposed a different answer: combine two cheap, complementary sensing modalities — **computer vision** and **wireless signal strength** — and use each to cover the weaknesses of the other. The complete system was released as open source and is available on [GitHub](https://github.com/tv-vicomtech/AudienceEngagement).

## The Two Modalities

**Visual channel.** Standard RGB cameras feed a pipeline built on **TensorFlow** and **OpenCV**. For each frame the system runs, in sequence:

1. Person detection — locating every individual in the frame.
2. Face detection inside each person bounding box.
3. Body-joint estimation — eyes, ears, nose, shoulders, elbows, hands, hips, knees, feet.
4. Frame-to-frame tracking to maintain stable identities over time.
5. Attention-direction estimation based on the geometric configuration of the eyes and nose — classified as *front*, *left*, *right*, or *no detection*.

The visual channel answers rich questions (how many people, where, are they looking at the stage?) but fails in poor lighting, behind obstacles, or when the camera simply does not cover a section of the venue.

**Wireless channel.** A network of **Raspberry Pi scanners** passively listens for WiFi and Bluetooth probe requests from devices in the environment. The received signal strength indicator (RSSI) from each scanner, combined across multiple nodes, is used to estimate the approximate location of each device within a set of predefined zones. The processing is done on a central server using the open-source **Find3** framework; scanners and server communicate via **MQTT (Mosquitto)**.

The wireless channel is robust to lighting and occlusions, covers the entire venue regardless of camera placement, and — crucially — provides a **per-device identity** that persists across the event without any cooperation from the attendee.

## Fusion

The two channels produce partially overlapping, partially complementary signals. The visual channel is *precise but narrow*: it tells you exactly who is looking at what, but only where a camera sees them. The wireless channel is *broad but coarse*: it knows someone is in the "main hall" zone, but not their pose or attention. The system fuses both to compute, for each zone and each time window:

- **Occupancy** — how many distinct devices and people were present.
- **Dwell time** — how long, on average, individuals stayed in the zone.
- **Attention share** — the fraction of visible people whose gaze was directed towards the designated focal point (stage, screen, exhibit).
- **Movement patterns** — total and maximum distance travelled, extracted from the visual tracks.

An engagement score is computed by weighting these primitives. The weights are not fixed: they can be tuned per venue and per event type, which matters because "engagement" looks very different at a conference talk (low movement, high attention share) than at a museum exhibit (moderate movement, high dwell time) or a product launch (high movement, variable attention).

## System Architecture

The software stack was designed to be deployable on commodity hardware:

- **Scanner nodes** — Raspberry Pi 3 / 4 units with wireless monitor-mode dongles, written in **Go** for efficiency on constrained hardware.
- **Server** — Go-based aggregation and inference service, also handling MQTT brokerage.
- **Vision processing** — Python 3 with TensorFlow and OpenCV; runs on a small GPU-equipped edge machine connected to the venue cameras.
- **Messaging** — MQTT over Mosquitto for all inter-component communication.
- **Deployment** — Docker images for each component to simplify installation at the venue.

The deliberate choice of **Go for the wireless side** and **Python for the vision side** reflected practical trade-offs: Go gave us the single-binary deployability and tight memory footprint we needed on the Pi scanners; Python gave us the machine-learning ecosystem for everything visual.

## Evaluation

The system was validated in controlled deployments where ground truth (attendee counts, known positions, attention direction recorded manually) could be compared against the system's output. The paper reports the fusion of both modalities consistently outperforms either modality alone for the composite engagement metric, especially in scenarios where one of the channels degrades (poor lighting for vision, device-dense environments for wireless).

## Why It Mattered

Three things made this project interesting beyond the engagement-metric angle:

1. **Multi-modal sensor fusion done pragmatically.** Academic papers on multi-modal systems often fuse modalities that share a common machine-learning formulation. Here the channels had completely different statistical properties, completely different hardware requirements, and different failure modes. The fusion had to respect that asymmetry.

2. **Open-source release.** The entire stack — scanner firmware, server, vision pipeline, MQTT plumbing, Docker files — is on GitHub and was designed for reproducibility. At the time, very little open tooling existed in the audience-analytics space outside of proprietary, closed commercial offerings.

3. **Privacy-aware by design.** The wireless channel uses **MAC addresses as transient identifiers only**, and all personal identifiers are dropped before aggregation. The visual channel produces only zone-level statistics, not per-person records. This was a deliberate response to the GDPR landscape that was crystallising in Europe in 2019–2020.

The work fed into subsequent research at Vicomtech on **multi-device media services** (IEEE Transactions on Broadcasting, **2021**) and shaped the broader thinking about **adaptive, context-aware media delivery** that I worked on throughout my time there.
