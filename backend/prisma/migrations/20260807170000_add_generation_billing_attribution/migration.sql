CREATE TYPE "GenerationBillingState" AS ENUM (
  'UNTRACKED',
  'AUTHORIZING',
  'SHADOW_ANONYMOUS',
  'SHADOW_UNLIMITED',
  'SHADOW_AVAILABLE',
  'SHADOW_INSUFFICIENT',
  'RESERVED',
  'UNLIMITED',
  'REUSED',
  'CONSUMED',
  'RELEASED'
);

ALTER TABLE "SagaGenerationJob"
ADD COLUMN "requestedByUserId" TEXT,
ADD COLUMN "billingState" "GenerationBillingState" NOT NULL DEFAULT 'UNTRACKED';

CREATE INDEX "SagaGenerationJob_requestedByUserId_createdAt_idx"
ON "SagaGenerationJob"("requestedByUserId", "createdAt");

CREATE INDEX "SagaGenerationJob_billingState_updatedAt_idx"
ON "SagaGenerationJob"("billingState", "updatedAt");

ALTER TABLE "SagaGenerationJob"
ADD CONSTRAINT "SagaGenerationJob_requestedByUserId_fkey"
FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
