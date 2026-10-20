/** IDs are stable because Functions, the dashboard, and setup must agree on them. */
export const resources = {
  appDatabase: "app",
  vectorDatabase: "vectors",
  chunks: "chunks",
  documentsBucket: "documents",
  collections: {
    businesses: "businesses",
    documents: "documents",
    conversations: "conversations",
    processedUpdates: "processed_updates",
    unansweredQuestions: "unanswered_questions",
    chatRateLimits: "chat_rate_limits",
  },
} as const;

export const defaults = {
  embeddingModel: "nomic-embed-text",
  embeddingDimension: 768,
  monthlyMessageLimit: 1000,
  chatMessagesPerMinute: 5,
  maximumUploadBytes: 10 * 1024 * 1024,
  allowedExtensions: [
    "pdf", "docx", "xlsx", "csv", "txt", "md", "png", "jpg", "jpeg", "webp",
  ],
} as const;

/** Stored server-side only. botToken is an AES-256-GCM envelope, never plaintext. */
export interface BusinessRecord {
  ownerId: string;
  name: string;
  botToken?: string;
  botUsername?: string;
  webhookSecret?: string;
  systemPrompt: string;
  language: string;
  status: "active" | "paused";
  monthlyMessageCount: number;
  monthlyLimit: number;
  usageMonth: string; // UTC YYYY-MM
  createdAt: string;
}

export interface DocumentRecord {
  businessId: string;
  fileId: string;
  filename: string;
  mimeType: string;
  status: "processing" | "ready" | "failed";
  errorMessage: string;
  chunkCount: number;
  createdAt: string;
}

export interface ConversationRecord {
  businessId: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ProcessedUpdateRecord {
  businessId: string;
  updateId: string;
  chatId: string;
  question: string;
  status: "queued" | "processing" | "sent" | "failed";
  attempts: number;
  createdAt: string;
  expiresAt: string;
}

export interface UnansweredQuestionRecord {
  businessId: string;
  question: string;
  createdAt: string;
}

export interface ChatRateLimitRecord {
  businessId: string;
  chatId: string;
  windowStart: string; // UTC minute
  count: number;
  expiresAt: string;
}

export interface ChunkMetadata {
  businessId: string;
  fileId: string;
  filename: string;
  section: string;
  text: string;
  price?: string;
  sourceKey: string;
}
