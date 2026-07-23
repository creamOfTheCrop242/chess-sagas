CREATE TABLE "StoryOutline" (
    "id" TEXT NOT NULL,
    "generationRunId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryOutline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoryOutline_generationRunId_key"
ON "StoryOutline"("generationRunId");

ALTER TABLE "StoryOutline"
ADD CONSTRAINT "StoryOutline_generationRunId_fkey"
FOREIGN KEY ("generationRunId") REFERENCES "GenerationRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
