-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "deactivated_at" TIMESTAMP(3),
ADD COLUMN     "monthly_fee" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "impersonation_handoffs" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "host" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "impersonation_handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "impersonation_handoffs_token_hash_key" ON "impersonation_handoffs"("token_hash");

-- CreateIndex
CREATE INDEX "impersonation_handoffs_expires_at_idx" ON "impersonation_handoffs"("expires_at");

-- AddForeignKey
ALTER TABLE "impersonation_handoffs" ADD CONSTRAINT "impersonation_handoffs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- `impersonation_handoffs` stays OUTSIDE RLS on purpose, like `tenants` and
-- `tenant_domains`: the ticket is spent on the clinic's host before any tenant scope
-- exists — trading the ticket for the session is precisely what sets one up. What guards
-- it is the token (256 bits, only the HMAC stored), the single use, the one-minute life
-- and the host written on it. Listed in tests/rls.test.ts among the deliberate exceptions.

-- An inactive clinic has a leaving date and an active one does not: that is what makes
-- "how many left in August" answerable instead of only "how many are out today".
ALTER TABLE "tenants"
  ADD CONSTRAINT tenants_inactive_has_a_date
  CHECK ("active" OR "deactivated_at" IS NOT NULL);

-- A monthly fee is never negative.
ALTER TABLE "tenants"
  ADD CONSTRAINT tenants_monthly_fee_not_negative
  CHECK ("monthly_fee" IS NULL OR "monthly_fee" >= 0);

-- A ticket is alive for a bounded window. The single use is enforced by a conditional
-- UPDATE in the application; this keeps the dates from lying about it.
ALTER TABLE "impersonation_handoffs"
  ADD CONSTRAINT impersonation_handoffs_expiry_after_creation
  CHECK ("expires_at" > "created_at");
