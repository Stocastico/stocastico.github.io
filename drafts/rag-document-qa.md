---
id:          rag-document-qa
title:       "RAG Document Assistant for Financial Services"
year:        "2023"
tags:        "RAG, LLM, NLP"
thumb:       "img/projects/rag-query.svg"
bg:          "img/projects/rag-query.svg"
description: "A retrieval-augmented generation system built for a large European bank, replacing manual SharePoint search with a conversational assistant that answers questions and cites the exact document and page where each answer was found."
---

While working at **NTT Data**, I designed and built a document question-answering system for a large European bank. The client held an extensive knowledge base — internal policies, compliance guidelines, product documentation, procedural manuals — stored as PDFs scattered across their SharePoint environment. Finding relevant information required employees to know which document to look for, navigate the folder structure, open the file, and search within it. The goal was to replace that process with a chatbot that could answer questions directly and, critically, point the user to the exact document and page containing the answer.

The solution was a **Retrieval-Augmented Generation (RAG)** pipeline, combining semantic search over a vector database with a large language model for answer synthesis.

## Ingestion Pipeline

The first stage processes all existing PDF documents and builds a searchable index. This runs offline and is re-triggered whenever documents are added or updated in SharePoint.

![Document ingestion pipeline](img/projects/rag-ingestion.svg)

1. **PDF extraction** — each document is parsed page by page, preserving the mapping between text and page number. This granularity is what makes precise citations possible later.
2. **Text chunking** — the extracted text is split into overlapping chunks of fixed token length. Overlap ensures that sentences spanning a chunk boundary are not lost; it also means a retrieved chunk always includes enough surrounding context for the LLM to produce a coherent answer.
3. **Embedding** — each chunk is passed through an embedding model, which maps it to a dense vector in a high-dimensional semantic space. Chunks with similar meaning end up close together in this space, regardless of exact wording.
4. **Vector database** — the resulting vectors are stored and indexed for fast approximate nearest-neighbour lookup. Crucially, each vector record carries metadata: the source filename, the page number, and the original chunk text. The embedding encodes *what* the chunk means; the metadata records *where* it came from.

## Query Pipeline

When a user submits a question, the system answers in real time through a two-stage process.

![Query and answer pipeline](img/projects/rag-query.svg)

1. **Query embedding** — the user's question is passed through the same embedding model used during ingestion, producing a query vector in the same semantic space.
2. **Similarity search** — the vector database computes cosine similarity between the query vector and all stored chunk vectors, returning the top-K most semantically relevant chunks along with their metadata.
3. **Answer generation** — the original question and the retrieved chunks are assembled into a prompt and sent to an LLM. The model synthesises a grounded answer from the provided context rather than relying on its training knowledge, which is essential in a domain where accuracy and traceability matter.
4. **Citations** — because each retrieved chunk carries its source filename and page number in the metadata, the system can append precise references to every answer, letting the user verify the information directly in the original document.

## What the User Sees

From the employee's perspective, the interaction is a standard chat interface. They type a question in natural language — "What is the escalation procedure for tier-2 complaints?" or "Which products are covered under the cross-border exemption?" — and receive a direct answer with one or more citations of the form *Document name, page N*. Clicking a citation opens the relevant page of the source PDF.

No need to know which folder anything lives in — you just ask, and you get an answer with a pointer back to the source so you can verify it yourself.

## Technical Notes

- The same embedding model must be used for both ingestion and query time; any change to the model requires a full re-embedding of the corpus.
- Chunk size and overlap are the main tuning parameters: too small and individual chunks lack context; too large and the retrieved chunks fill the LLM's context window, leaving little room for the answer.
- Metadata fidelity during PDF parsing is the key engineering challenge — multi-column layouts, headers, footers, and scanned pages all require careful handling to ensure page numbers remain accurate.
