
-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('NEW', 'CONTACTED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "interest_leads" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "clinic" TEXT,
    "message" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "host" TEXT NOT NULL,
    "status" "lead_status" NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "handled_by_user_id" UUID,
    "handled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interest_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interest_leads_status_created_at_idx" ON "interest_leads"("status", "created_at");

-- CreateIndex
CREATE INDEX "interest_leads_ip_created_at_idx" ON "interest_leads"("ip", "created_at");

-- AddForeignKey
ALTER TABLE "interest_leads" ADD CONSTRAINT "interest_leads_handled_by_user_id_fkey" FOREIGN KEY ("handled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security: a shape of its own
-- ─────────────────────────────────────────────────────────────────────────────
-- This table has no tenant_id — a contact request belongs to the platform, not to any
-- clinic. The other tenant-less tables (`tenants`, `tenant_domains`,
-- `impersonation_handoffs`) simply stay outside RLS, but this one holds a stranger's
-- name, e-mail and phone, so it stays inside with three policies instead of the usual
-- two. Permissive policies are OR'd, so together they say:
--
--   * anyone may INSERT — the public form has no session and opens no scope at all;
--   * only platform scope may SELECT, UPDATE or DELETE — no clinic ever reaches an
--     address here, even through a bug in the application;
--   * the intake path may read the rows of its OWN ip from the last day, which is all
--     it needs to rate-limit itself.
--
-- The third policy is why the anonymous path never has to open platform scope, and that
-- is deliberate: `withPlatformScope` is documented as a security bug outside a confirmed
-- SUPERADMIN. The cost is that the anonymous path cannot write `audit_log` either — so
-- the record of a submission is the row itself, which carries ip, user_agent and
-- created_at, the same way `consents.signed_ip` does.

ALTER TABLE "interest_leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "interest_leads" FORCE ROW LEVEL SECURITY;

CREATE POLICY interest_leads_public_insert ON "interest_leads"
  FOR INSERT WITH CHECK (true);

CREATE POLICY interest_leads_platform_scope ON "interest_leads"
  FOR ALL
  USING (app_platform_scope())
  WITH CHECK (app_platform_scope());

CREATE POLICY interest_leads_own_ip ON "interest_leads"
  FOR SELECT
  USING (
    "ip" = nullif(current_setting('app.lead_ip', true), '')
    AND "created_at" > now() - interval '1 day'
  );

-- An e-mail address is the point of the row: without one there is nobody to answer.
ALTER TABLE "interest_leads"
  ADD CONSTRAINT interest_leads_email_looks_like_one
  CHECK ("email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');

-- A handled request says who handled it and when, or neither. Half of that pair is a
-- row nobody can explain later.
ALTER TABLE "interest_leads"
  ADD CONSTRAINT interest_leads_handled_together
  CHECK (("handled_by_user_id" IS NULL) = ("handled_at" IS NULL));
