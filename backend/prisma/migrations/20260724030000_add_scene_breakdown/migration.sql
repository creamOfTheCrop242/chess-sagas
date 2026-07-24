ALTER TYPE "GenerationStage" ADD VALUE 'SCENE_BREAKDOWN';

CREATE TABLE "SceneBreakdown" (
    "id" TEXT NOT NULL,
    "generationRunId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SceneBreakdown_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SceneBreakdown_generationRunId_key" ON "SceneBreakdown"("generationRunId");
ALTER TABLE "SceneBreakdown" ADD CONSTRAINT "SceneBreakdown_generationRunId_fkey"
FOREIGN KEY ("generationRunId") REFERENCES "GenerationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
