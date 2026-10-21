# tele-rag

TeleRAG turns a small business’s documents into grounded customer support answers. The current MVP includes Supabase sign-in, private document storage, text extraction, OpenRouter embeddings, vector retrieval, grounded chat answers, and a Telegram webhook integration.

## Run locally

Use Node.js 20 or later. Copy `.env.example` to `.env` and fill in your project keys:

```env
SUPABASE_URL=https://<PROJECT_REF>.supabase.co
SUPABASE_ANON_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
OPENROUTER_API_KEY=<OPENROUTER_API_KEY>
OPENROUTER_CHAT_MODEL=minimax/minimax-m3.1-flash:free
OPENROUTER_EMBEDDING_MODEL=thenlper/gte-base
TELEGRAM_WEBHOOK_BASE_URL=https://<YOUR_PUBLIC_APP_DOMAIN>
```

Keep the service role and OpenRouter keys server-side. `.env` is ignored by Git. In Supabase Authentication settings, enable email/password sign-in. For a quick local trial, email confirmation can be disabled; otherwise confirm the signup link before signing in.

```powershell
npm install
npm run setup:supabase
npm run dev
```

Open http://localhost:3000/workspace, create an account, upload a PDF, DOCX, CSV, TXT, or Markdown file (up to 10 MiB), and ask a question about it. Files upload directly from the browser to the private Supabase Storage bucket using a short-lived signed upload URL; the application server only receives upload metadata and performs indexing after the upload finishes. The root page remains a scripted product demo. The setup script creates the private `documents` Storage bucket; run `supabase/migrations/0001_initial.sql` once in the Supabase SQL Editor to create the tables, RLS rules, pgvector index, and match function.

OpenRouter chat uses the free MiniMax M3.1 Flash endpoint. Embeddings use `thenlper/gte-base` at $0.005 per million input tokens, producing 768 dimensions to match `vector(768)`. Its 512-token input limit is why indexing uses short overlapping chunks. Keep the same embedding model for indexing and query embeddings. Changing it later requires re-embedding stored chunks. Free chat endpoints have provider availability and request limits.

To enable Telegram, deploy the app at a public HTTPS URL and set `TELEGRAM_WEBHOOK_BASE_URL` to that origin. Apply `supabase/migrations/0002_telegram_bots.sql` in the Supabase SQL editor, restart the server, then connect a bot token in the signed-in workspace. Create the token with Telegram's BotFather. Bot tokens are encrypted server-side using a key derived from the Supabase service-role key; never expose that service-role key to the browser. Telegram webhooks cannot reach a localhost-only dev server.

## Build the static preview

```powershell
npm run build
npm run preview
```

The current authenticated workspace requires the Node server and server-side environment variables; static hosting of `dist/` only serves the marketing/demo pages and does not provide the API routes.

## Current scope

- One business workspace per authenticated account
- Private uploads for PDF, DOCX, CSV, TXT, and Markdown
- Text extraction, overlapping chunking, and 768-dimensional OpenRouter embeddings
- Tenant-filtered vector retrieval and source-labelled answers
- Unanswered questions stored for later review
- Spreadsheet extraction, OCR for scanned/image files, usage billing, and admin dashboard are not implemented yet
