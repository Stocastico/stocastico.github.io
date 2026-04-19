---
id:          ufc-fighter-tracking
title:       "UFC Fighter Tracking: Multi-Modal Sensing in the Octagon"
year:        "2017"
tags:        "Computer Vision, Sensor Fusion, Sports Analytics"
thumb:       "img/projects/ufc-octagon-thumb.jpg"
bg:          "img/projects/ufc-octagon-bg.jpg"
description: "End-to-end real-time analytics for live UFC events: stereo computer vision in the truss above the octagon, accelerometers in the gloves, GPU inference at the venue, and statistics streamed to fans worldwide. Built at AGT International in 2017 and demoed live by our CEO during Werner Vogels' keynote at AWS re:Invent 2017."
link_video:  "https://www.youtube.com/watch?v=vataVq9gY_o"
---

This is the project I tell people about when they ask me what the most fun thing I have ever worked on was. In **2017**, while I was a Senior Data Scientist at **AGT International** in Darmstadt, our team built a real-time fighter-tracking and analytics system for the **UFC**. The product was launched as part of **HEED**, AGT's IoT-driven sports platform, and was presented in a live demonstration by our CEO **Mati Kochavi** during AWS CTO Werner Vogels' keynote at **AWS re:Invent 2017** in Las Vegas — see the [recording on YouTube](https://www.youtube.com/watch?v=vataVq9gY_o).

The brief was straightforward and impossible to fake: produce real-time, broadcast-quality statistics for an MMA fight, generated from the cage itself, with no human operator pressing buttons. The system had to work everywhere the UFC went, install in hours, survive the production environment of a live televised event, and feed numbers into the official mobile app while the fight was still happening.

![UFC octagon from above — camera coverage](img/projects/ufc-octagon-overhead.jpg)

## What We Measured

The output of the system was a continuous stream of statistics for each of the two fighters:

- **Position and speed** — every fighter's location inside the octagon, sampled many times per second.
- **Octagon control** — which fighter was occupying the centre vs. being pushed against the cage, computed from the relative positions over time.
- **Total movement** — distance covered by each fighter through a round and across the fight.
- **Posture state** — *standing* vs. *on the ground*, with transitions timestamped so the broadcast could show "X seconds of ground game".
- **Strike counts** — kicks and punches, separated by type (jab, hook, uppercut, …) and by *attempted* vs. *landed*.

All of this was published to the cloud, aggregated, and pushed to the consumer-facing UFC app and to broadcast graphics in near real time.

## Hardware in the Truss

Coverage of a UFC octagon — eight sides, fast lateral motion, frequent occlusions when fighters clinched — was the first hard problem. We solved it with **two [Stereolabs ZED](https://www.stereolabs.com/) RGB-D cameras** mounted on the **truss above the cage**, angled to give overlapping fields of view that covered the entire fighting surface. The depth channel was crucial: knowing the distance of each fighter from the camera let us resolve the ambiguities that single RGB streams suffered from, especially during ground exchanges.

Both cameras were cabled to a **GPU-equipped PC, also mounted on the truss**, which performed all the perception work locally. Doing inference at the venue (rather than streaming raw footage to a remote machine) was a deliberate choice — it eliminated the network as a bottleneck, kept latency in the sub-second range, and meant the system kept working even when venue connectivity wobbled. The PC then streamed only the resulting statistics down to the cloud over a much narrower data path.

![Truss-mounted cameras and edge GPU PC](img/projects/ufc-truss-rig.jpg)

## Sensor Fusion: Vision + Accelerometers

Pure vision could detect that a punch had been *thrown*, but not whether it had *connected* — and certainly not the punch *type* with the precision the UFC wanted. The fix was multi-modal: a parallel sensor team had instrumented the fighters' **gloves with accelerometers**, providing a second, completely independent signal for every strike.

We fused the two streams in real time:

- The **vision pipeline** detected the launch of a strike, identified which fighter threw it, and gave a coarse classification of its trajectory.
- The **accelerometer pipeline** detected the impact event, the magnitude of the deceleration, and the kinematic signature characteristic of different punch types (uppercut, hook, straight).
- A **fusion layer** matched accelerometer events to vision events by timestamp and fighter ID, and used the combination to decide *hit vs. miss* and to commit a final classification of the punch type.

This is the kind of system that looks obvious in a slide but is fiddly to make work in practice. Clock synchronisation between the camera PC and the wireless sensor receivers had to be tight; the matching window had to be loose enough to absorb jitter but tight enough not to confuse two strikes thrown in quick succession; and the whole pipeline had to fail gracefully when one modality dropped out (a sensor disconnect, a camera momentarily occluded by a referee).

## Cloud and Delivery

Once produced at the edge, the statistics were ingested through **AWS** services (Kinesis for ingestion, downstream services for processing, persistence, and fan-out — see [AGT's separate AWS re:Invent 2017 talk on the Kinesis side of the architecture](https://www.youtube.com/watch?v=zHSEnKb69go)). From there they were relayed to the UFC app and to broadcast partners. The end-to-end latency target was *fast enough that the on-screen number was correct by the time a viewer looked down at it* — a few seconds, not minutes.

## My Role

This was the project where I was involved **end to end**, and I think of it as the moment my career stopped being purely about algorithms:

- **Algorithm design** — I worked on the perception side: detection, tracking, posture classification, and the matching logic that fused vision with the accelerometer stream.
- **Network and edge architecture** — choices about where computation happened (truss vs. cloud), how data moved between components, and how the system behaved under network degradation.
- **Product ownership** — translating between what the UFC wanted as a product (clean, interpretable, defensible numbers) and what we could measure as engineers.
- **Customer-facing point of contact** — direct contact with the UFC and with the third-party sensor team that built the glove instrumentation, coordinating their hardware and our software so the two halves of the system actually shipped as one product.
- **Live deployment** — I travelled to multiple live events around the world to install, calibrate, and operate the system on fight nights. There is no substitute for standing under the truss while a fight is happening to find out what your software does not handle.

## Why It Was Special

Three things made this project the one I still talk about:

1. **Multi-modality done in earnest.** Computer vision and inertial sensing are completely different beasts statistically and operationally; making them produce a single, coherent stream of statistics was a real engineering problem rather than a checkbox.
2. **Live events around the world.** I helped run the system at fight nights on multiple continents. Each venue brought its own truss geometry, lighting, network, and crew — and the system had to work in all of them.
3. **End-to-end ownership.** I touched every layer, from the GPU code on the truss PC to the data contracts with the broadcaster, and I was the person the UFC and the sensor partner picked up the phone to call. That breadth shaped how I work to this day.

## Public Material

- **AWS re:Invent 2017 keynote demo** — Mati Kochavi (AGT/HEED founder) presents the UFC use-case live during Werner Vogels' keynote: [YouTube](https://www.youtube.com/watch?v=vataVq9gY_o)
- **AWS re:Invent 2017 — AGT uses Amazon Kinesis for IoT Analytics** — companion talk on the cloud architecture: [YouTube](https://www.youtube.com/watch?v=zHSEnKb69go)
