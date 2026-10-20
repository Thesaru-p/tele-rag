import {
  AppwriteException,
  Client,
  DocumentsDB,
  DocumentsDBIndexType,
  Permission,
  Role,
  Storage,
  VectorsDB,
  VectorsDBIndexType,
} from "node-appwrite";
import { defaults, resources } from "../packages/core/src/model.js";

const collectionSpecs = [
  {
    id: resources.collections.businesses,
    indexes: [{ key: "owner_unique", type: DocumentsDBIndexType.Unique, attributes: ["ownerId"] }],
  },
  {
    id: resources.collections.documents,
    indexes: [
      { key: "file_unique", type: DocumentsDBIndexType.Unique, attributes: ["fileId"] },
      { key: "business_created", type: DocumentsDBIndexType.Key, attributes: ["businessId", "createdAt"] },
      { key: "business_status", type: DocumentsDBIndexType.Key, attributes: ["businessId", "status"] },
    ],
  },
  {
    id: resources.collections.conversations,
    indexes: [{ key: "chat_history", type: DocumentsDBIndexType.Key, attributes: ["businessId", "chatId", "createdAt"] }],
  },
  {
    id: resources.collections.processedUpdates,
    indexes: [
      { key: "update_unique", type: DocumentsDBIndexType.Unique, attributes: ["businessId", "updateId"] },
      { key: "update_expiry", type: DocumentsDBIndexType.Key, attributes: ["expiresAt"] },
    ],
  },
  {
    id: resources.collections.unansweredQuestions,
    indexes: [{ key: "unanswered_recent", type: DocumentsDBIndexType.Key, attributes: ["businessId", "createdAt"] }],
  },
  {
    id: resources.collections.chatRateLimits,
    indexes: [
      { key: "chat_window_unique", type: DocumentsDBIndexType.Unique, attributes: ["businessId", "chatId", "windowStart"] },
      { key: "chat_expiry", type: DocumentsDBIndexType.Key, attributes: ["expiresAt"] },
    ],
  },
] as const;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith("<")) throw new Error(`Set ${name} before running setup.`);
  return value;
}

function isNotFound(error: unknown): boolean {
  return error instanceof AppwriteException && error.code === 404;
}

async function getOrCreate<T>(
  label: string,
  get: () => Promise<T>,
  create: () => Promise<T>,
): Promise<T> {
  try {
    const value = await get();
    console.log(`Exists: ${label}`);
    return value;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  const value = await create();
  console.log(`Created: ${label}`);
  return value;
}

async function main(): Promise<void> {
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({
      databases: [resources.appDatabase, resources.vectorDatabase],
      collections: collectionSpecs.map(({ id, indexes }) => ({ id, indexes })),
      vectors: { collection: resources.chunks, dimension: defaults.embeddingDimension, index: "hnsw_cosine" },
      bucket: {
        id: resources.documentsBucket,
        maximumFileSize: defaults.maximumUploadBytes,
        allowedFileExtensions: defaults.allowedExtensions,
        permissions: [Permission.create(Role.users())],
        fileSecurity: true,
        encryption: true,
      },
    }, null, 2));
    return;
  }

  const client = new Client()
    .setEndpoint(required("APPWRITE_ENDPOINT"))
    .setProject(required("APPWRITE_PROJECT_ID"))
    .setKey(required("APPWRITE_API_KEY"));
  const documents = new DocumentsDB(client);
  const vectors = new VectorsDB(client);
  const storage = new Storage(client);

  await getOrCreate(
    "DocumentsDB app",
    () => documents.get({ databaseId: resources.appDatabase }),
    () => documents.create({ databaseId: resources.appDatabase, name: "app", specification: "serverless" }),
  );
  await getOrCreate(
    "VectorsDB vectors",
    () => vectors.get({ databaseId: resources.vectorDatabase }),
    () => vectors.create({ databaseId: resources.vectorDatabase, name: "vectors", specification: "serverless" }),
  );

  for (const { id, indexes } of collectionSpecs) {
    const collection = await getOrCreate(
      `app/${id}`,
      () => documents.getCollection({ databaseId: resources.appDatabase, collectionId: id }),
      () => documents.createCollection({
        databaseId: resources.appDatabase,
        collectionId: id,
        name: id,
        permissions: [],
        documentSecurity: true,
      }),
    );
    if (!collection.documentSecurity || collection.$permissions.length !== 0) {
      throw new Error(`app/${id} must have document security and no collection-wide permissions.`);
    }
    for (const index of indexes) {
      const existing = await getOrCreate(
        `app/${id}/${index.key}`,
        () => documents.getIndex({ databaseId: resources.appDatabase, collectionId: id, key: index.key }),
        () => documents.createIndex({
          databaseId: resources.appDatabase,
          collectionId: id,
          key: index.key,
          type: index.type,
          attributes: [...index.attributes],
        }),
      );
      if (existing.type !== index.type || JSON.stringify(existing.attributes) !== JSON.stringify(index.attributes)) {
        throw new Error(`Index app/${id}/${index.key} does not match the expected definition.`);
      }
      if (existing.status === "failed" || existing.status === "stuck") {
        throw new Error(`Index app/${id}/${index.key} failed: ${existing.error}`);
      }
    }
  }

  const chunks = await getOrCreate(
    "vectors/chunks",
    () => vectors.getCollection({ databaseId: resources.vectorDatabase, collectionId: resources.chunks }),
    () => vectors.createCollection({
      databaseId: resources.vectorDatabase,
      collectionId: resources.chunks,
      name: resources.chunks,
      dimension: defaults.embeddingDimension,
      permissions: [],
      documentSecurity: false,
    }),
  );
  if (chunks.dimension !== defaults.embeddingDimension || chunks.documentSecurity || chunks.$permissions.length !== 0) {
    throw new Error("vectors/chunks must use the configured dimension and remain private.");
  }
  const vectorIndex = await getOrCreate(
    "vectors/chunks/embeddings_cosine",
    () => vectors.getIndex({ databaseId: resources.vectorDatabase, collectionId: resources.chunks, key: "embeddings_cosine" }),
    () => vectors.createIndex({
      databaseId: resources.vectorDatabase,
      collectionId: resources.chunks,
      key: "embeddings_cosine",
      type: VectorsDBIndexType.HnswCosine,
      attributes: ["embeddings"],
    }),
  );
  if (vectorIndex.type !== VectorsDBIndexType.HnswCosine || JSON.stringify(vectorIndex.attributes) !== '["embeddings"]') {
    throw new Error("vectors/chunks index must be HNSW cosine on embeddings.");
  }
  if (vectorIndex.status === "failed" || vectorIndex.status === "stuck") {
    throw new Error(`Vector index failed: ${vectorIndex.error}`);
  }

  const bucket = await getOrCreate(
    "Storage documents",
    () => storage.getBucket({ bucketId: resources.documentsBucket }),
    () => storage.createBucket({
      bucketId: resources.documentsBucket,
      name: resources.documentsBucket,
      permissions: [Permission.create(Role.users())],
      fileSecurity: true,
      maximumFileSize: defaults.maximumUploadBytes,
      allowedFileExtensions: [...defaults.allowedExtensions],
      encryption: true,
    }),
  );
  const createOnly = [Permission.create(Role.users())];
  if (!bucket.fileSecurity || !bucket.encryption || bucket.maximumFileSize !== defaults.maximumUploadBytes ||
      JSON.stringify([...bucket.allowedFileExtensions].sort()) !== JSON.stringify([...defaults.allowedExtensions].sort()) ||
      JSON.stringify([...bucket.$permissions].sort()) !== JSON.stringify(createOnly.sort())) {
    throw new Error("Storage documents bucket does not match its private upload policy.");
  }
  console.log("Appwrite resources are configured. Indexes may finish building asynchronously; check their status before ingestion.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
