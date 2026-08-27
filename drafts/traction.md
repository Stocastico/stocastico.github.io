---
id:          traction
kind:        work
title:       "TRACTION: Opera Co-creation for Social Transformation"
year:        "2020 – 2022"
tags:        "Media & Live Events, Education & Research"
bg:          "img/projects/traction-bg.webp"
og:          "img/projects/og/traction.png"
description: "TRACTION was a Horizon 2020 project, coordinated by Vicomtech, that used opera as a vehicle for social inclusion. My work centred on the Co-creation Stage, the real-time distributed performance tool, spanning development, user-requirements gathering, evaluation, and direct engagement with artistic and community partners across Barcelona, Leiria and Ireland."
link_paper:  "https://ieeexplore.ieee.org/abstract/document/9828558"
link_demo:   "https://www.traction-project.eu/"
---

TRACTION (*Opera co-creation for a social transformation*) was a three-year EU [Horizon 2020](https://research-and-innovation.ec.europa.eu/funding/funding-opportunities/funding-programmes-and-open-calls/horizon-2020_en) research and innovation action that ran from **January 2020 to December 2022**, coordinated by **[Vicomtech](https://www.vicomtech.org/en)** and with a total budget of roughly **€3.75M**. The project set out to do something deceptively simple: take opera — an art form often perceived as elitist and inaccessible — and turn it back into a vehicle for social and cultural inclusion, by giving marginalised communities the tools to **co-create** opera performances alongside professional artists.

That ambition was tested in three very different places: the inner-city neighbourhoods of **Barcelona** (Raval), a youth prison in **Leiria, Portugal**, and the rural communities of **Ireland**. The technological backbone of the project was a pair of digital platforms developed at Vicomtech and [CWI](https://www.cwi.nl/en/): the **Co-creation Space** and the **Co-creation Stage**.

## My Role

My main contribution was to the **Co-creation Stage** — the real-time distributed performance tool that allowed a single opera to be staged simultaneously across multiple co-located venues, synchronising live video, audio and interaction between stages. I was involved across the full lifecycle, in a role that combined technical development with research and partnership activities:

- **Development**: working on both the frontend and the backend of the Stage, contributing to the low-latency adaptive media transmission layer that made synchronised live performance across venues possible.
- **User-requirements gathering**: working closely with the artistic partners — Liceu in Barcelona, SAMP in Leiria, Irish National Opera in Ireland — and with sociologists and community educators to translate what professional artists and community participants actually needed into concrete software features.
- **Evaluation**: designing and running usability studies and field trials, collecting and analysing feedback, and feeding findings back into the design and development loop.
- **Partner engagement**: maintaining ongoing dialogue with consortium partners across research, opera, education and prison-work organisations in five countries, bridging the gap between technical decisions and the realities of the artistic and community use cases.

The Co-creation Stage was the centrepiece of the live-performance moments: a production could be co-presented from a main opera house and from community sites at the same time, dissolving the traditional boundary between professional stage and audience or participant.

## Tech Stack

The Co-creation Stage is a real-time distributed performance application:

- **Frontend** — [Angular](https://angular.dev/) with [TypeScript](https://www.typescriptlang.org/), designed for multi-venue operator interfaces and audience-facing views.
- **Backend** — low-latency adaptive media transmission to synchronise live video and audio across geographically separated stages in real time.
- **Deployment** — containerised services orchestrated to support live events with strict latency requirements.

The companion **Co-creation Space** — the asynchronous collaboration platform built mainly by colleagues — used a different stack (Node.js / TypeScript / Express backend; React / Redux frontend; PostgreSQL + MongoDB for storage; AWS S3 + Elastic Transcoder for media; WebSockets for real-time notifications) and was designed for the ongoing creative process between live events.

## Outcomes

By the end of the project, the two tools had supported three full community opera productions across **eleven locations**, engaging over **1,300 non-professional artists**, reaching more than **8,000 live audience members** across six languages, and registering more than **20,000 user interactions** on the platforms.

- In **Barcelona**, [*La Gata Perduda*](https://www.liceubarcelona.cat/en/liceu-apropa/la-gata-perduda) was performed twice at the Liceu Opera House to sold-out audiences in October 2022, with a choir formed from twelve amateur choirs from the Raval. The Catalan public broadcast reached around 766,000 viewers. The [TRACTION project page for the Liceu trial](https://www.traction-project.eu/trials/liceu/) documents the full co-creation process behind the production.
- In **Leiria**, *O Tempo (Somos Nós)* — produced with SAMP and the young inmates, their relatives and prison workers — was performed four times in June 2022: twice inside the prison and twice at the Gulbenkian's main concert hall in Lisbon.
- In **Ireland**, *Out of the Ordinary / As an nGnách* became the world's first virtual reality community opera, co-created with rural teenagers and toured around the country.

Survey data from participants reported that 94% felt actively involved, 89% learned from others, and 75% reported improved well-being.

## Social Implications

What stayed with me long after the project finished is what the technology *enabled* rather than what the technology *was*. A platform for sharing videos, comments and audio clips is, in pure software terms, not a remarkable thing. But put it in the hands of a teenager in a juvenile detention centre who has spent years being told their voice does not matter, and the same software becomes a way to record a song that ends up performed at the Gulbenkian concert hall in front of their family. Put it in the hands of a migrant choir in Raval, and it becomes the connective tissue of an opera that fills the Liceu.

That is also where the responsibility of the technical role becomes very tangible: every design choice — what is private and what is shared, who can comment on what, how reliable the upload is on a tablet on a slow connection inside a prison — has consequences that go far beyond a usability metric. Building software that is going to be used in those settings requires a different kind of attention than building software for a generic "user".
