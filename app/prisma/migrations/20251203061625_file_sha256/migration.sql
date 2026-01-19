-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "fileHash" CHAR(64);

-- CreateIndex
CREATE INDEX "documents_fileHash_idx" ON "documents"("fileHash");
