# Release TeleRAG 1.0

## Existing installation

1. In the existing Supabase project's SQL Editor, run `supabase/migrations/0003_workspace_release.sql`. It adds document diagnostics, stored sources, monthly usage, atomic request limits, and tighter client permissions. It preserves documents and accounts and can be rerun safely.
2. Run `npm run doctor` with the project's `.env`. Every check must pass. Fresh projects must first apply 0001, 0002, and 0003 in order and run `npm run setup:supabase`.
3. Run `npm ci` and `npm run check`.
4. Authenticate with `vercel login`. Link the checkout to the existing TeleRAG project using `vercel link` if needed.
5. Configure the variables in `.env.example` in Vercel Project Settings. Keep the service-role and OpenRouter keys server-side. Use Node.js 22 or later.
6. Set `TELEGRAM_WEBHOOK_BASE_URL` to the production HTTPS origin without a path, query, or fragment. Set Supabase Auth Site URL and redirect allowlist for the deployed `/workspace` URL. Include `http://localhost:3000/workspace` for development.
7. Run `vercel` for a preview deployment. After reviewing it, run `vercel --prod` to release production. Production Telegram should point at the production origin.
8. Connect or reconnect the bot in the deployed workspace. Reconnecting is required if the token encryption key changed.

## Live verification

- Try sample questions and source links on the landing page. Its chat is a scripted demo.
- Open `/api/health`; expect `status: "ok"`.
- Sign up, confirm the email if enabled, sign in, and reload the workspace.
- Save a business name. Upload `examples/studio-handbook.md`. Confirm it becomes ready.
- Ask “How much is the beginner pottery class?” Expect $35 and a handbook source. Ask a question absent from the handbook; expect the fallback and a new unanswered question.
- Mark the question reviewed. Verify both exchanges appear in conversation history.
- Delete a disposable sample document. Verify it no longer participates in retrieval. Reupload it if needed for the demo.
- Connect Telegram, send `/start`, and ask a handbook question. Verify the welcome, answer, and source label. Keep tokens out of screenshots.
- Verify password recovery with your own account and inbox. Supabase must allow the callback URL. This manual check is separate from fixture tests.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Public browser authentication key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server database/storage access and token encryption |
| `OPENROUTER_API_KEY` | Server embedding/chat requests |
| `OPENROUTER_CHAT_MODEL` | Default `qwen/qwen3.8-27b` |
| `OPENROUTER_EMBEDDING_MODEL` | Default `thenlper/gte-base`, 768 dimensions |
| `TELEGRAM_WEBHOOK_BASE_URL` | Production public HTTPS origin |

## Troubleshooting

- Dashboard, uploads, or chat fail after updating: apply the release migration before deploying this code. Run `npm run doctor` to identify missing schema.
- A document stays processing: refresh after five minutes. Interrupted indexing becomes failed and exposes Retry indexing. Split files over 160 chunks.
- No readable text: use a selectable-text PDF or perform OCR before uploading.
- Session expires: automatic renewal normally handles this; expired/revoked refresh tokens return to sign-in.
- Password-reset email or callback fails: check email delivery settings and the redirect allowlist.
- Bot connection fails: verify migrations, BotFather token, and the public origin. Telegram cannot reach localhost.
- 429 response: wait until the next minute or UTC month, depending on the exhausted allowance. Rejected requests do not increase counters; reserved AI attempts do, including provider failures.

A standalone static host cannot provide authenticated RAG or Telegram webhooks. Review a configured preview deployment before releasing production.
