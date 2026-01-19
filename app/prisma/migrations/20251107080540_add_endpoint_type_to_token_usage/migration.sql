-- AlterTable
ALTER TABLE "token_usage" ADD COLUMN     "endpointType" TEXT DEFAULT 'document-chat';

-- CreateIndex
CREATE INDEX "token_usage_endpointType_idx" ON "token_usage"("endpointType");
