---
id:          donostia-dataviz
kind:        personal
title:       "Is tourism raising the rent? Donostia, in open data"
year:        "2026"
tags:        "Data Journalism, Open Data, Python"
bg:          "img/projects/donostia-dataviz.svg"
description: "Seven data stories about how San Sebastián is changing — housing, barrios, people, climate, and the gap between the tourist city and the lived one. Built from six open sources with a reproducible pipeline; the question that started it turned out to have an uncomfortable answer."
link_demo:   "https://stefanomasneri.com/donostia-dataviz/"
link_github: "https://github.com/Stocastico/donostia-dataviz"
---

Two complaints come up in every conversation I have with friends here: everything costs more than it did, and tourism is eating the barrios. They are usually said in the same breath, as if the second one explained the first. I wanted to know whether the data agreed.

It mostly doesn't. Both things are happening, and they are happening in different neighbourhoods.

This is the piece that came out of asking. Seven chapters of scrollytelling over Donostia's 187,000 residents and 19 barrios — housing, what moves, who lives there, who works, the climate backdrop, the two cities, and a synthesis — plus an appendix on where perception and data part ways, and an epilogue on what the numbers still cannot answer.

**The piece itself is in Spanish**, which is the language the argument is actually had in.

## What the data says

Prices are up: around **+60 %** per square metre to buy since 2016, well ahead of salaries and inflation. But the *pressure* — rent as a share of income — is heaviest in the working-class east rather than the expensive centre: Altza 21.9 %, Egia 21.3 %, Intxaurrondo 20.9 %.

Tourism is concentrated somewhere else entirely. Erdialdea, the centre, reaches 33 Airbnb listings per 1,000 residents. Airbnb *activity* has gone up roughly **×6 since 2016**, but the active supply is essentially flat (**+1.3 %**) — the same flats, worked much harder.

And the link everyone assumes? It does not survive the controls. The raw correlation between tourist pressure and rent increases is about 0.27; once common year-effects are discounted — the shocks that hit the whole city at once — it falls to **≈0.10**, and a permutation test cannot tell it from noise (p ≈ 0.30). Tourism is real, the rent rise is real, and the causal arrow between them is not demonstrated by this data.

The rest is a set of things I did not go looking for. The centre is severely aged (Gros has 370 people over 65 for every 100 minors) and loses population by natural decline rather than by expulsion. The east stays young through immigration, and shows two very different immigrant profiles — one in the low-income east, one in the wealthy centre. The gender wage gap is universal, 20–44 % depending on the barrio. The city imports workers: 1.20 jobs per resident worker. Average temperature is up **+1.6 °C** since the 1980s, and the urban heat island lands **+4 °C above the city average** on the same dense eastern barrios already carrying the rental pressure. Different mechanisms, converging on the same postcodes.

## How it is built

Six public sources: Donostia Open Data (padrón, tourist-use flats, amenities, noise), Eustat for income by neighbourhood, the Basque Government's EMA for rental €/m², INE for overnight stays, Inside Airbnb for listings, and AEMET's Igeldo station for the climate series.

A Python pipeline turns those into tidy CSV tables, which the site reads directly — every figure on the page traces back to a public table and a script, and the CSVs are downloadable so anyone can disagree with me using my own numbers. Lead-lag analysis with year effects, bootstrap confidence intervals, k-means clustering and permutation tests do the statistical work. Each metric carries a confidence card that says plainly whether it is observed, derived, or a proxy standing in for something nobody measures directly.

## What it cannot say

The epilogue is the part I would most want a reader to reach. Gentrification is not shown here — proving it needs data on *which residents rotate out*, and that data does not exist publicly. Causality from tourism to rent is not demonstrated, only bounded. And the whole analysis works at neighbourhood level, so any statement it makes about people is one ecological fallacy away from being wrong.

That is a less satisfying conclusion than the one my friends and I arrived at over drinks. It is also the honest one, and saying so is most of the reason the piece exists.
