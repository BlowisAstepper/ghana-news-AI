-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "mergedIntoId" TEXT;

-- CreateIndex
CREATE INDEX "Article_mergedIntoId_idx" ON "Article"("mergedIntoId");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
