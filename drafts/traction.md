---
id:          traction
title:       "TRACTION: Opera Co-creation for Social Transformation"
year:        "2020 – 2022"
tags:        "Web Application, Co-creation, Social Inclusion"
thumb:       "img/projects/traction-thumb.jpg"
bg:          "img/projects/traction-bg.jpg"
description: "TRACTION was a Horizon 2020 project, coordinated by Vicomtech, that used opera as a vehicle for social inclusion. I helped in the development of the Co-creation Stage — a web application enabling diverse communities to collaborate around multimedia content — and worked side by side with at-risk groups in Barcelona's Raval neighbourhood and Leiria's juvenile prison."
link_demo:    "https://www.traction-project.eu/"
link_paper:   "https://ieeexplore.ieee.org/abstract/document/9828558"
---

TRACTION (*Opera co-creation for a social transformation*) was a three-year EU Horizon 2020 research and innovation action that ran from **January 2020 to December 2022**, coordinated by **Vicomtech** and with a total budget of roughly **€3.75M**. The project set out to do something deceptively simple: take opera — an art form often perceived as elitist and inaccessible — and turn it back into a vehicle for social and cultural inclusion, by giving marginalised communities the tools to **co-create** opera performances alongside professional artists.

That ambition was tested in three very different places: the inner-city neighbourhoods of **Barcelona** (Raval), a youth prison in **Leiria, Portugal**, and the rural communities of **Ireland**. The technological backbone of the project was a pair of digital platforms developed at Vicomtech and CWI: the **Co-creation Space** and the **Co-creation Stage**.

## My Role

My main contribution was to the **Co-creation Space** — the web application that enables content exchange, communication, and collaboration between professional artists and community participants around shared multimedia experiences. I was involved across the full lifecycle:

- **Development of the web application for sharing multimedia experiences via the web.** I worked on both the backend services and the frontend, designing and implementing the features that allowed community members to upload videos, audio recordings, lyrics, sketches and other media, comment and discuss around them, group them into threads, and progressively shape them into the building blocks of an opera performance.
- **Defining the user requirements**, working closely with the artistic partners (Liceu in Barcelona, SAMP in Leiria, Irish National Opera in Ireland) and with sociologists and educators to translate what the communities actually needed into concrete software features.
- **Evaluating the platform** through usability studies and field testing, gathering feedback and feeding it back into the design loop.
- **Working side by side with the at-risk communities** during the trials — running on-site sessions in Barcelona and travelling to Leiria prison to support the inmates, their families and the prison staff while they used the platform. Seeing teenagers who had every reason to distrust strangers with cameras and laptops slowly take ownership of the tool and start producing their own material was one of the most rewarding experiences of my career.

The Co-creation Space was conceived, in the words of the project, as a kind of **"private social media"** dedicated to a single artistic production: a safe, moderated space where conversation, asynchronous collaboration and active co-authorship could happen around the same media objects.

## Tech Stack

The Co-creation Space is a full-stack web application:

- **Backend** — Node.js with TypeScript, Express.js as the web framework, and Sequelize as the ORM.
- **Database** — PostgreSQL for relational data and MongoDB for less structured content.
- **Frontend** — React with Redux for state management, SCSS for styling.
- **Media pipeline** — Amazon S3 for media storage, AWS Elastic Transcoder for video transcoding, and Amazon SNS for asynchronous event handling between the transcoding pipeline and the application.
- **Real-time features** — WebSockets for chat and live notifications.
- **Deployment** — Docker and Docker Compose, with the production environment running on AWS.
- **Tooling** — Webpack, Jest for testing, ESLint, Yarn.

The Co-creation Stage — the companion real-time performance tool, built mainly by colleagues — used a different stack (Angular / TypeScript on the frontend, with low-latency adaptive media transmission on the backend) and was designed for distributed live performances across multiple co-located stages.

## Outcomes

By the end of the project, the two tools had supported three full community opera productions across **eleven locations**, engaging over **1,300 non-professional artists**, reaching more than **8,000 live audience members** across six languages, and registering more than **20,000 user interactions** on the platforms.

- In **Barcelona**, *La Gata Perduda* was performed twice at the Liceu Opera House to sold-out audiences in October 2022, with a choir formed from twelve amateur choirs from the Raval. The Catalan public broadcast reached around 766,000 viewers.
- In **Leiria**, *O Tempo (Somos Nós)* — produced with SAMP and the young inmates, their relatives and prison workers — was performed four times in June 2022: twice inside the prison and twice at the Gulbenkian's main concert hall in Lisbon.
- In **Ireland**, *Out of the Ordinary / As an nGnách* became the world's first virtual reality community opera, co-created with rural teenagers and toured around the country.

Survey data from participants reported that 94% felt actively involved, 89% learned from others, and 75% reported improved well-being.

## Social Implications

What stayed with me long after the project finished is what the technology *enabled* rather than what the technology *was*. A platform for sharing videos, comments and audio clips is, in pure software terms, not a remarkable thing. But put it in the hands of a teenager in a juvenile detention centre who has spent years being told their voice does not matter, and the same software becomes a way to record a song that ends up performed at the Gulbenkian concert hall in front of their family. Put it in the hands of a migrant choir in Raval, and it becomes the connective tissue of an opera that fills the Liceu.

That is also where the responsibility of the technical role becomes very tangible: every design choice — what is private and what is shared, who can comment on what, how reliable the upload is on a tablet on a slow connection inside a prison — has consequences that go far beyond a usability metric. Building software that is going to be used in those settings requires a different kind of attention than building software for a generic "user".

## Working with the Consortium

Beyond the technology and the social impact, what made TRACTION special for me was the **consortium itself** — eight partners spanning research, opera, education and prison work, in five countries:

- **Vicomtech** (coordinator, Spain) — applied research in visual computing and media.
- **Dublin City University** (Ireland) — research on participatory media and audience engagement.
- **Irish National Opera** (Ireland) — opera production.
- **Gran Teatre del Liceu** (Spain) — opera house.
- **NWO-I / CWI** (Netherlands) — research in distributed systems and immersive media.
- **SAMP — Sociedade Artística Musical dos Pousos** (Portugal) — music school and prison-based education.
- **Universitat Autònoma de Barcelona** (Spain) — research in communication and media studies.
- **Virtual Reality Ireland Media** (Ireland) — VR production.
