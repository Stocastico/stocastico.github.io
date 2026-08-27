---
id:          mnist-lenet
kind:        personal
title:       "Draw a digit, watch a LeNet-5 read it"
year:        "2026"
tags:        "Data & Interactive"
bg:          "img/projects/mnist-lenet.svg"
og:          "img/projects/mnist-lenet-og.png"
description: "A LeNet-5 trained on MNIST, running live in the browser. Draw a digit with the mouse and watch every layer's activations light up as the signal propagates to a verdict."
---

LeNet-5 on MNIST is the hello world of convolutional networks. I wanted something on the homepage that was actually about deep learning rather than a generic abstract background, and that turned into writing the network myself in JavaScript: first the training, then the visualisation.

This page is the interactive version. Draw a digit in the box, and the same trained network classifies it live: no server, no ML runtime, just the weights and a forward pass. Every layer's activations are shown as they fire, along with the confidence for all ten classes, so you can see where the network hesitates rather than only what it decided.

Drawing something ambiguous is the interesting part.

## How it works

The network is trained offline by `scripts/train-cnn.mjs` (plain JavaScript, no dependencies, no framework), reaching 98.27% on the MNIST test split. The weights are quantised to int8 and shipped as a 44 KB module that only this page loads.

The forward pass in your browser is the identical code the training script uses, so the two can never drift apart. One classification is around 280 000 multiply-accumulates: under a millisecond, which is why it can run inside a pointer-move handler while you are still drawing.

The step that actually decides whether this works is the preprocessing. MNIST digits are not raw 28×28 images: each one is cropped to its bounding box, scaled so the longest side is 20 pixels, and then centred in the 28×28 field **by centre of mass** rather than by bounding box. Skip that last part and hand-drawn digits classify badly, which looks like a broken model but is really an out-of-distribution input.
