---
# Duplicate this file and fill in the values below.
# Run: node scripts/new-project.js <this-file.md> [--dry-run]
# Output: projects/<id>.html (standalone detail page) + entry in data/projects.js
#
# Required:
#   id:          kebab-case identifier, becomes the HTML filename
#   title:       Project title (quoted string)
#   year:        Project year (quoted string)
#   tags:        Comma-separated keywords, 1–3 (quoted string)
#   bg:          Path to image used semi-transparently behind the homepage
#                card AND as the hero banner on the detail page.
#   description: Short 2–3 sentence summary shown on the homepage card
#
# Optional:
#   link_paper:  "https://link.springer.com/..."
#   link_github: "https://github.com/..."
#   link_demo:   "https://..."
#   link_video:  "https://youtube.com/..."

id:          gaussian-nerf
title:       "3D reconstruction using Gaussian Splatting and NeRF"
year:        "2025"
tags:        "AI, Computer Vision"
bg:          "img/projects/gaussian-splat.webp"
description: "Research into NeRFs and 3D Gaussian Splatting as a pipeline for capturing real-world locations as photorealistic assets for LED-volume virtual production. Evaluated camera setups, algorithms (nerfacto, splatfacto, MCMC), and Unreal Engine integration — benchmarked against RealityCapture and Postshot. The work produced a desktop application that runs COLMAP pose estimation followed by user-chosen reconstruction either locally or on Azure, with a browser-based Gaussian splat viewer."
---

Turning real-world locations into photorealistic 3D assets for virtual production — using neural radiance fields and Gaussian splatting, with a cloud-backed desktop app that makes large-scale reconstruction practical.

## Why a media company cares about 3D reconstruction

Virtual production has changed how films, commercials, and sports content are made. Instead of filming an entire scene on location, productions can now shoot actors or presenters in front of a large **LED volume** — a curved wall of high-resolution LED panels displaying a photorealistic background in real time — achieving in-camera compositing without a green screen or post-production keying.

The challenge is the background itself. Traditionally these are CG environments built by hand, which is expensive and slow. **3D reconstruction from real footage** offers a different path: you send a crew to a location for a fraction of the time a full shoot would require, capture the scene with cameras, and reconstruct a photorealistic 3D asset that can then be loaded into the LED volume back in the studio. You get the authenticity of a real place at a fraction of the logistical cost.

## What we investigated

Making sure that we could reconstruct scenes with a quality good enough for production required working through the problem from several angles simultaneously.

**Cameras and capture conditions.** The quality of the reconstruction depends heavily on the input data. We evaluated how different camera hardware, lens choices, and movement patterns affected results — and just as importantly, what kinds of lighting conditions, surface types, and scene complexity cause algorithms to fail.

**Algorithms.** The field splits broadly into two families. [Neural Radiance Fields (NeRF)](https://www.matthewtancik.com/nerf) represent a scene as a continuous volumetric function learned by a neural network: computationally expensive but capable of impressive novel-view synthesis. [3D Gaussian Splatting](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/) takes a different approach, representing the scene as millions of explicit 3D Gaussians that can be rendered in real time via rasterisation — much faster at inference time and increasingly competitive in quality. Within each family we tested several variants: [nerfacto](https://docs.nerf.studio/nerfology/methods/nerfacto.html) and [Instant NGP](https://nvlabs.github.io/instant-ngp/) on the NeRF side; [splatfacto](https://docs.nerf.studio/nerfology/methods/splat.html), [MCMC](https://ubc-vision.github.io/3dgs-mcmc/) and others on the Gaussian side.

**Integration with existing tooling.** A reconstruction that can't feed into a production pipeline is useless. We tested how to export and ingest our outputs into [Unreal Engine](https://www.unrealengine.com/), which is the dominant engine for real-time virtual production, and assessed what format conversions, level-of-detail considerations, and scene-scale issues needed to be solved.

**Comparison with commercial solutions.** We benchmarked against established tools: [RealityCapture](https://www.capturingreality.com/) (a photogrammetry-first pipeline, best-in-class for mesh quality) and [Postshot](https://www.jawset.com/) (a fast, user-friendly desktop Gaussian splatting tool). Understanding where those products fall short — particularly around scalability — directly shaped what we built.

## The application

The research eventually converged into a desktop application that takes a video or an image sequence as input and runs the full reconstruction pipeline.

The first step is always [COLMAP](https://colmap.github.io/): a structure-from-motion pipeline that estimates camera poses for every frame, producing the sparse point cloud that reconstruction algorithms need as a starting point. After that, the user can choose between three reconstruction methods — **nerfacto**, **splatfacto**, or **MCMC** — depending on the trade-offs they care about (training time, output quality, downstream use).

The key architectural decision was making the compute location flexible. The app can run the entire pipeline **locally** on the user's machine if it has a capable enough GPU, or **offload the heavy training to a cloud machine hosted on Azure** when the dataset is too large or the hardware isn't available. Once reconstruction is complete, results can be visualised directly in the browser using a lightly modified version of [SuperSplat](https://playcanvas.com/supersplat/editor), PlayCanvas's open-source Gaussian splat viewer.

## The advantage over existing tools

The cloud-backed compute is the differentiating feature. Existing commercial solutions like Postshot are polished and fast, but they run exclusively on local hardware — which puts a hard ceiling on how much data you can process in a reasonable time. For small captures (a few hundred images), that's fine. For large-scale scenes — a stadium, an outdoor environment, a complex architectural space — you're looking at thousands of input images, and no single workstation handles that gracefully.

By routing training to Azure, our pipeline has no practical ceiling on dataset size. The same application that reconstructs a small product shot locally can handle a multi-thousand-image exterior capture in the cloud, without changing the user's workflow.

## Hardware: combining cameras and LiDAR

Purely image-based reconstruction has an inherent weakness: textureless or reflective surfaces, and large uniform regions, confuse both NeRF and Gaussian methods badly. During the project we also experimented with hardware from [xGrids](https://www.xgrids.com/), whose rigs combine RGB cameras with LiDAR depth sensors to capture geometry and appearance simultaneously. The LiDAR-informed pipeline produces a **Gaussian splat and a mesh in a single pass**, with accurate geometry even where the images alone would struggle. For virtual production specifically — where you may need to place CG objects precisely in a real environment — having a reliable mesh alongside the splat is probably the best current approach.

## What's next

The research field is moving fast. New methods keep narrowing the gap between reconstruction quality and real-time usability: [2D Gaussian Splatting](https://surfsplatting.github.io/), [Mip-Splatting](https://niujinshuchong.github.io/mip-splatting/), and feed-forward reconstruction models like [DUST3R](https://dust3r.europe.naverlabs.com/) and [MASt3R](https://europe.naverlabs.com/blog/mast3r-matching-and-stereo-3d-reconstruction/) are among the directions we're actively tracking. The app is designed to absorb new algorithms as they mature — the modular pipeline means plugging in a new reconstruction backend doesn't require rebuilding everything around it.

This is still an open problem. The goal is to keep the gap between what state-of-the-art research can do and what a production team can actually use as small as possible.
