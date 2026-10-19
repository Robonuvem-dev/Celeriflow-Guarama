CREATE TABLE "TransparencyPageFeedback" (
    "id" TEXT NOT NULL,
    "submissionKey" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "collectionSlug" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransparencyPageFeedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TransparencyPageFeedback_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
    CONSTRAINT "TransparencyPageFeedback_page_check" CHECK ("page" IN ('HOME', 'SEARCH', 'CONSULTATION')),
    CONSTRAINT "TransparencyPageFeedback_comment_check" CHECK (length("comment") <= 2000)
);
CREATE UNIQUE INDEX "TransparencyPageFeedback_submissionKey_key" ON "TransparencyPageFeedback"("submissionKey");
CREATE INDEX "TransparencyPageFeedback_createdAt_idx" ON "TransparencyPageFeedback"("createdAt");
CREATE INDEX "TransparencyPageFeedback_page_createdAt_idx" ON "TransparencyPageFeedback"("page", "createdAt");
