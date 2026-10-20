# tele-rag

Document-to-Telegram chatbot SaaS for small businesses. Milestone 1 contains the
Appwrite resource setup and shared data model; ingestion, bots, and the dashboard
are built in later milestones.

## Milestone 1: Appwrite resources

Create an [Appwrite Cloud](https://cloud.appwrite.io/) project. Make a setup API
key with `documentsdb.read`, `documentsdb.write`,
`documentsdb.collections.read`, `documentsdb.collections.write`,
`vectorsdb.read`, `vectorsdb.write`, `vectorsdb.collections.read`,
`vectorsdb.collections.write`, `vectorsdb.indexes.read`,
`vectorsdb.indexes.write`, `buckets.read`, and `buckets.write` scopes. Keep this
key server-side and remove or rotate it after setup.

Use Node.js 20 or later. In PowerShell, from the repository root:

```powershell
npm ci
npm run typecheck
npm run setup:appwrite -- --dry-run
$env:APPWRITE_ENDPOINT = "https://<REGION>.cloud.appwrite.io/v1"
$env:APPWRITE_PROJECT_ID = "<PROJECT_ID>"
$env:APPWRITE_API_KEY = "<SETUP_KEY>"
npm run setup:appwrite
```

The setup command is safe to rerun. It creates a DocumentsDB database `app`
with six private collections, a VectorsDB database `vectors` with a private
768-dimensional `chunks` collection and HNSW cosine index, and an encrypted
`documents` Storage bucket. The bucket allows signed-in users to create files,
but grants no bucket-wide read permission. Future uploads must set file-level
permissions for their owner.

The bucket accepts PDF, DOCX, XLSX, CSV, TXT, Markdown, PNG, JPEG, and WebP up
to 10 MiB. The database records and vector metadata are defined in
`packages/core/src/model.ts`. DocumentsDB is schemaless; these TypeScript
interfaces are the application contract. Business secrets, usage counters,
conversation records, and vectors are only accessed through server functions.

To verify in the Appwrite Console, inspect both database types, each collection's
permissions and indexes, and the Storage bucket's file security, encryption,
extension list, and create-only bucket permission. Wait until indexes show
`available` before ingesting documents. No Appwrite resources are created by the
dry run.

