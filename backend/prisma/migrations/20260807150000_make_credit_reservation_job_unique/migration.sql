DROP INDEX IF EXISTS "CreditReservation_sagaGenerationJobId_idx";

CREATE UNIQUE INDEX "CreditReservation_sagaGenerationJobId_key"
ON "CreditReservation"("sagaGenerationJobId");
