-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "GenerationStage" AS ENUM ('LEDGER', 'NARRATIVE_ANALYSIS', 'OUTLINE', 'STORY', 'VALIDATION', 'REPAIR');

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "pgnHash" TEXT NOT NULL,
    "rawPgn" TEXT NOT NULL,
    "whitePlayer" TEXT NOT NULL,
    "blackPlayer" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameLedger" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "initialFen" TEXT NOT NULL,
    "finalFen" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationRun" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'QUEUED',
    "currentStage" "GenerationStage" NOT NULL DEFAULT 'LEDGER',
    "model" TEXT,
    "promptVersion" TEXT,
    "options" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Game_ownerId_createdAt_idx" ON "Game"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Game_pgnHash_idx" ON "Game"("pgnHash");

-- CreateIndex
CREATE UNIQUE INDEX "GameLedger_gameId_key" ON "GameLedger"("gameId");

-- CreateIndex
CREATE INDEX "GenerationRun_gameId_createdAt_idx" ON "GenerationRun"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationRun_status_createdAt_idx" ON "GenerationRun"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "GameLedger" ADD CONSTRAINT "GameLedger_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationRun" ADD CONSTRAINT "GenerationRun_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
