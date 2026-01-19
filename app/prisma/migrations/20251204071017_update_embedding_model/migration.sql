-- AlterTable
ALTER TABLE "document_embeddings" ALTER COLUMN "embedding_model" SET DEFAULT 'gemini-embedding-001';

-- AlterTable
ALTER TABLE "document_info" ALTER COLUMN "embedding_model" SET DEFAULT 'gemini-embedding-001';
