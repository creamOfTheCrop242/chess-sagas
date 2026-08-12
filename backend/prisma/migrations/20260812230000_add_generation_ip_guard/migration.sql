ALTER TABLE "SagaGenerationJob"
ADD COLUMN "requestIpHash" TEXT;

CREATE INDEX "SagaGenerationJob_requestIpHash_createdAt_idx"
ON "SagaGenerationJob"("requestIpHash", "createdAt");

CREATE UNIQUE INDEX "SagaGenerationJob_one_active_per_user_idx"
ON "SagaGenerationJob"("requestedByUserId")
WHERE "requestedByUserId" IS NOT NULL
  AND "status" IN ('QUEUED', 'RUNNING');
