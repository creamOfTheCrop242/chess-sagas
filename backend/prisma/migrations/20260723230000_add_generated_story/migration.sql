CREATE TABLE "GeneratedStory" (
    "id" TEXT NOT NULL,
    "generationRunId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "storyMarkdown" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedStory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GeneratedStory_generationRunId_key"
ON "GeneratedStory"("generationRunId");

ALTER TABLE "GeneratedStory"
ADD CONSTRAINT "GeneratedStory_generationRunId_fkey"
FOREIGN KEY ("generationRunId") REFERENCES "GenerationRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
