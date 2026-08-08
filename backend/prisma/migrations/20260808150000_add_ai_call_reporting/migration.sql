CREATE TYPE "AiCallStatus" AS ENUM ('SUCCEEDED', 'FAILED');

CREATE TABLE "AiCall" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "generationRunId" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" "AiCallStatus" NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "repairMode" TEXT,
  "durationMs" INTEGER NOT NULL,
  "payloadBytes" INTEGER NOT NULL,
  "inputTokens" INTEGER NOT NULL,
  "cachedInputTokens" INTEGER NOT NULL,
  "cacheWriteTokens" INTEGER NOT NULL,
  "reasoningTokens" INTEGER NOT NULL,
  "outputTokens" INTEGER NOT NULL,
  "estimatedCostMicros" INTEGER NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiCall_createdAt_idx" ON "AiCall"("createdAt");
CREATE INDEX "AiCall_gameId_createdAt_idx" ON "AiCall"("gameId", "createdAt");
CREATE INDEX "AiCall_generationRunId_idx" ON "AiCall"("generationRunId");
CREATE INDEX "AiCall_stage_model_status_createdAt_idx" ON "AiCall"("stage", "model", "status", "createdAt");

ALTER TABLE "AiCall"
ADD CONSTRAINT "AiCall_gameId_fkey"
FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiCall"
ADD CONSTRAINT "AiCall_generationRunId_fkey"
FOREIGN KEY ("generationRunId") REFERENCES "GenerationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
