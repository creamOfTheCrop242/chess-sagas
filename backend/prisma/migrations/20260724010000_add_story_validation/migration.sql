CREATE TABLE "StoryValidation" (
    "id" TEXT NOT NULL,
    "generationRunId" TEXT NOT NULL,
    "sourceStoryId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "valid" BOOLEAN NOT NULL,
    "findings" JSONB NOT NULL,
    "repairedStoryMarkdown" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoryValidation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoryValidation_generationRunId_key"
ON "StoryValidation"("generationRunId");

ALTER TABLE "StoryValidation"
ADD CONSTRAINT "StoryValidation_generationRunId_fkey"
FOREIGN KEY ("generationRunId") REFERENCES "GenerationRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
