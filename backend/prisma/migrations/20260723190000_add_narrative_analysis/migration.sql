CREATE TABLE "NarrativeAnalysis" (
    "id" TEXT NOT NULL,
    "generationRunId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NarrativeAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NarrativeAnalysis_generationRunId_key"
ON "NarrativeAnalysis"("generationRunId");

ALTER TABLE "NarrativeAnalysis"
ADD CONSTRAINT "NarrativeAnalysis_generationRunId_fkey"
FOREIGN KEY ("generationRunId") REFERENCES "GenerationRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
