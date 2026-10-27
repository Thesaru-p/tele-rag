# LinkedIn draft

Before posting: apply the release migration, deploy, and finish the live checks in DEPLOYMENT.md. Add a verified live URL and your own screenshots.

Suggested carousel: [business and customer workflow](../output/imagegen/telerag-customer-workflow-v2.png), then [RAG architecture](../output/imagegen/telerag-rag-system-v2.png), followed by a real workspace screenshot. [Exact image prompts](../output/imagegen/README.md) are saved with the assets.

---

I built TeleRAG: a document-powered customer support assistant for small businesses. 📄 → 💬

The idea started with a simple question: what if a business could turn its existing handbooks, price lists, and policies into answers customers can get on Telegram?

TeleRAG lets a business owner:

• Upload PDF, DOCX, CSV, TXT, or Markdown documents to a private workspace
• Ask questions and see which documents support the answer
• Connect a Telegram bot to the same knowledge base
• Review conversation history, usage, and unanswered questions
• Update the knowledge base as new questions come in

Under the hood, I used Node.js, Supabase, PostgreSQL with pgvector, OpenRouter, and the Telegram Bot API.

One useful lesson: building a RAG app involves much more than sending a prompt to a model. I had to think about tenant isolation, private uploads, chunking, source validation, session renewal, webhook retries, and request limits. I also added automated tests that run real database migrations and check row-level security and vector retrieval.

This is an MVP with room to improve. Building it helped me connect AI features with the practical work of making an application usable.

Source code: https://github.com/Thesaru-p/tele-rag
Live demo: [add your verified deployment URL]

I’d welcome feedback on the project and how you would improve the customer experience.

#RAG #AI #FullStackDevelopment #NodeJS #Supabase #PostgreSQL #Telegram #BuildInPublic
