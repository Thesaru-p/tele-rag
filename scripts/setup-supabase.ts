import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { defaults } from "../packages/core/src/model.js";

function loadEnv(): void {
  try {
    for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || match[1] in process.env) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
      process.env[match[1]] = value;
    }
  } catch {
    // Environment variables may be supplied by the shell or CI instead.
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith("<")) throw new Error(`Set ${name} before running setup.`);
  return value;
}

async function main(): Promise<void> {
  loadEnv();
  const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await supabase.storage.createBucket("documents", {
    public: false,
    fileSizeLimit: `${defaults.maximumUploadBytes}B`,
    allowedMimeTypes: [
      "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv", "text/plain",
      "text/markdown", "image/png", "image/jpeg", "image/webp",
    ],
  });
  if (error && !/already exists/i.test(error.message)) throw error;
  console.log(error ? "Exists: Storage documents" : "Created: Storage documents");
  console.log("Run supabase/migrations/0001_initial.sql in the Supabase SQL editor.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
