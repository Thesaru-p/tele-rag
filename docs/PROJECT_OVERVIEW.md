# TeleRAG — project overview

Small businesses repeat answers that already exist in price lists, handbooks, and policies. TeleRAG makes those documents searchable and lets customers ask questions on Telegram.

## What I built

A full-stack RAG application with an interactive public demo, authenticated workspace, private uploads, vector retrieval, source-backed answers, and Telegram delivery. Owners manage documents, edit their business name, review conversations, and identify unanswered questions.

The landing page and workspace use React and TypeScript, bundled with Vite. A warm paper palette, editorial typography, and a charcoal dark theme give the interface a consistent identity. The landing page includes reading progress, one-time reveals, subtle paper parallax, and a sticky walkthrough that changes with the current section. Reduced-motion preferences disable decorative movement.

## How answers work

1. The browser uploads directly to private Supabase Storage using a signed URL.
2. The server extracts text, creates overlapping chunks, requests embedding batches, and saves 768-dimensional vectors in Postgres.
3. A question reserves an allowance atomically, then retrieves passages from ready documents belonging to that business.
4. The model receives the question and excerpts. Its structured result states whether the evidence supports an answer and identifies numbered sources.
5. The server validates source numbers, returns document names, and records the exchange. Unsupported answers enter the review list.

## Engineering decisions

- Authenticated server queries, RLS, and the vector function enforce tenant isolation.
- Direct storage uploads avoid large serverless request bodies.
- Batched embeddings and document limits bound synchronous indexing work.
- Database transactions serialize allowance checks across API instances.
- Telegram verifies webhook secrets and protects against duplicate updates.
- Failed/interrupted indexing can be retried; document deletion cascades to chunks.
- Session renewal cannot restore a signed-out session after a delayed refresh.
- Tests execute actual PostgreSQL/pgvector migrations and check RLS and retrieval. External APIs are mocked.

## Stack

React, TypeScript, Vite, CSS, Node.js, Supabase Auth/Storage, PostgreSQL, pgvector, OpenRouter, Telegram Bot API, Vercel, Vitest, React Testing Library, Node's test runner, PGlite, and GitHub Actions.

## Demonstration

Show the landing page, sign in, name the business, upload the sample handbook, ask about prices, inspect the source, ask an unanswered question, review it in the dashboard, and finish with Telegram.

See the illustrated [RAG architecture](../output/imagegen/telerag-rag-system-v2.png) and [business/customer workflow](../output/imagegen/telerag-customer-workflow-v2.png) for shareable explanations of the system.

This is a one-owner MVP for selectable-text documents. It has usage caps rather than billing and an owner dashboard rather than a platform administrator console. Do not claim production scale, measured accuracy, customer adoption, or a live release without evidence.
