CREATE TABLE "SagaGenerationJob" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'QUEUED',
    "currentStage" "GenerationStage" NOT NULL DEFAULT 'NARRATIVE_ANALYSIS',
    "error" TEXT,
    "workerId" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SagaGenerationJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SagaGenerationJob_gameId_key" ON "SagaGenerationJob"("gameId");
CREATE INDEX "SagaGenerationJob_status_lockedUntil_idx" ON "SagaGenerationJob"("status", "lockedUntil");

ALTER TABLE "SagaGenerationJob"
ADD CONSTRAINT "SagaGenerationJob_gameId_fkey"
FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
