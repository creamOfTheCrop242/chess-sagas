CREATE TYPE "BillingPlan" AS ENUM ('SCRIBE', 'CHRONICLER', 'REALM_FOUNDER');

CREATE TABLE "BillingSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "BillingPlan" NOT NULL,
    "priceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillingSubscription_userId_status_idx" ON "BillingSubscription"("userId", "status");
CREATE INDEX "BillingSubscription_priceId_idx" ON "BillingSubscription"("priceId");

ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
