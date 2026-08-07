CREATE TYPE "SagaVisibility" AS ENUM ('PUBLIC', 'UNLISTED', 'PRIVATE');

CREATE TYPE "CreditLedgerEntryType" AS ENUM (
    'INTRODUCTORY_GRANT',
    'ONE_TIME_PURCHASE',
    'SUBSCRIPTION_GRANT',
    'GENERATION_CONSUMPTION',
    'GENERATION_REFUND',
    'PURCHASE_REFUND',
    'ADMINISTRATIVE_ADJUSTMENT'
);

CREATE TYPE "CreditReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED');

ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;

CREATE TABLE "PublicProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" VARCHAR(500),
    "showCreatorCredit" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Saga" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "generationRunId" TEXT NOT NULL,
    "creatorId" TEXT,
    "visibility" "SagaVisibility" NOT NULL DEFAULT 'PUBLIC',
    "storyVersion" TEXT,
    "parentSagaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Saga_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SagaBookmark" (
    "userId" TEXT NOT NULL,
    "sagaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SagaBookmark_pkey" PRIMARY KEY ("userId", "sagaId")
);

CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "objectId" TEXT,
    "livemode" BOOLEAN NOT NULL,
    "apiVersion" TEXT,
    "payload" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "CreditLedgerEntryType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "stripeEventId" TEXT,
    "referenceId" TEXT,
    "description" VARCHAR(500),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditReservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sagaGenerationJobId" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "status" "CreditReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CreditReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX "PublicProfile_userId_key" ON "PublicProfile"("userId");
CREATE UNIQUE INDEX "PublicProfile_handle_key" ON "PublicProfile"("handle");
CREATE INDEX "PublicProfile_createdAt_idx" ON "PublicProfile"("createdAt");
CREATE UNIQUE INDEX "Saga_generationRunId_key" ON "Saga"("generationRunId");
CREATE INDEX "Saga_visibility_createdAt_idx" ON "Saga"("visibility", "createdAt");
CREATE INDEX "Saga_creatorId_createdAt_idx" ON "Saga"("creatorId", "createdAt");
CREATE INDEX "Saga_gameId_createdAt_idx" ON "Saga"("gameId", "createdAt");
CREATE INDEX "Saga_parentSagaId_idx" ON "Saga"("parentSagaId");
CREATE INDEX "SagaBookmark_sagaId_idx" ON "SagaBookmark"("sagaId");
CREATE INDEX "SagaBookmark_userId_createdAt_idx" ON "SagaBookmark"("userId", "createdAt");
CREATE UNIQUE INDEX "CreditLedgerEntry_idempotencyKey_key" ON "CreditLedgerEntry"("idempotencyKey");
CREATE INDEX "CreditLedgerEntry_userId_createdAt_idx" ON "CreditLedgerEntry"("userId", "createdAt");
CREATE INDEX "CreditLedgerEntry_referenceId_idx" ON "CreditLedgerEntry"("referenceId");
CREATE INDEX "CreditLedgerEntry_stripeEventId_idx" ON "CreditLedgerEntry"("stripeEventId");
CREATE INDEX "CreditLedgerEntry_userId_expiresAt_idx" ON "CreditLedgerEntry"("userId", "expiresAt");
CREATE INDEX "CreditReservation_userId_status_idx" ON "CreditReservation"("userId", "status");
CREATE INDEX "CreditReservation_sagaGenerationJobId_idx" ON "CreditReservation"("sagaGenerationJobId");
CREATE INDEX "StripeEvent_type_receivedAt_idx" ON "StripeEvent"("type", "receivedAt");
CREATE INDEX "StripeEvent_objectId_idx" ON "StripeEvent"("objectId");
CREATE INDEX "StripeEvent_processedAt_idx" ON "StripeEvent"("processedAt");

ALTER TABLE "PublicProfile" ADD CONSTRAINT "PublicProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Saga" ADD CONSTRAINT "Saga_gameId_fkey"
FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Saga" ADD CONSTRAINT "Saga_generationRunId_fkey"
FOREIGN KEY ("generationRunId") REFERENCES "GenerationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Saga" ADD CONSTRAINT "Saga_creatorId_fkey"
FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Saga" ADD CONSTRAINT "Saga_parentSagaId_fkey"
FOREIGN KEY ("parentSagaId") REFERENCES "Saga"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SagaBookmark" ADD CONSTRAINT "SagaBookmark_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SagaBookmark" ADD CONSTRAINT "SagaBookmark_sagaId_fkey"
FOREIGN KEY ("sagaId") REFERENCES "Saga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_stripeEventId_fkey"
FOREIGN KEY ("stripeEventId") REFERENCES "StripeEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_sagaGenerationJobId_fkey"
FOREIGN KEY ("sagaGenerationJobId") REFERENCES "SagaGenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve existing completed tellings as public archive sagas. Their creator is
-- retained when the originating game was already associated with an account.
INSERT INTO "Saga" (
    "id",
    "gameId",
    "generationRunId",
    "creatorId",
    "visibility",
    "storyVersion",
    "createdAt",
    "updatedAt"
)
SELECT
    'saga_' || gr."id",
    gr."gameId",
    gr."id",
    g."ownerId",
    'PUBLIC'::"SagaVisibility",
    gr."promptVersion",
    COALESCE(gs."createdAt", gr."createdAt"),
    COALESCE(gr."completedAt", gs."createdAt", gr."updatedAt")
FROM "GenerationRun" gr
JOIN "Game" g ON g."id" = gr."gameId"
JOIN "GeneratedStory" gs ON gs."generationRunId" = gr."id"
JOIN "SceneBreakdown" sb ON sb."generationRunId" = gr."id"
WHERE gr."status" = 'COMPLETED';
