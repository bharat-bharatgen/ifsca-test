-- AlterTable
ALTER TABLE "document_summaries" ADD COLUMN     "embedding" vector(768),
ADD COLUMN     "embedding_256d" vector(256),
ADD COLUMN     "embedding_model" TEXT DEFAULT 'gemini-embedding-001';
