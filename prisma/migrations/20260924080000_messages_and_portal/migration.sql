-- CreateEnum
CREATE TYPE "message_kind" AS ENUM ('REMINDER_24H', 'PREP_48H', 'FOLLOW_UP_1D', 'RETURN_14D', 'NO_SHOW_POLICY', 'BIRTHDAY');

-- CreateEnum
CREATE TYPE "message_status" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "patient_id" UUID;

-- CreateTable
CREATE TABLE "message_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" "message_kind" NOT NULL,
    "body" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" "message_kind" NOT NULL,
    "patient_id" UUID NOT NULL,
    "appointment_id" UUID,
    "phone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "status" "message_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "provider_message_id" TEXT,
    "error" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_replies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID,
    "appointment_id" UUID,
    "phone" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "action" TEXT,
    "provider_message_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_tenant_id_kind_key" ON "message_templates"("tenant_id", "kind");

-- CreateIndex
CREATE INDEX "message_jobs_tenant_id_status_scheduled_for_idx" ON "message_jobs"("tenant_id", "status", "scheduled_for");

-- CreateIndex
CREATE INDEX "message_jobs_appointment_id_idx" ON "message_jobs"("appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_jobs_tenant_id_dedupe_key_key" ON "message_jobs"("tenant_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "message_replies_provider_message_id_key" ON "message_replies"("provider_message_id");

-- CreateIndex
CREATE INDEX "message_replies_tenant_id_received_at_idx" ON "message_replies"("tenant_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_patient_id_key" ON "users"("patient_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_jobs" ADD CONSTRAINT "message_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_jobs" ADD CONSTRAINT "message_jobs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_jobs" ADD CONSTRAINT "message_jobs_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_replies" ADD CONSTRAINT "message_replies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security, the same shape as every other business table: deny by default, one
-- policy for the tenant slice, one for platform scope, and FORCE because the application
-- role owns the tables.
ALTER TABLE "message_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY message_templates_tenant_isolation ON "message_templates"
  USING ("tenant_id" = app_current_tenant())
  WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY message_templates_platform_scope ON "message_templates"
  USING (app_platform_scope())
  WITH CHECK (app_platform_scope());

ALTER TABLE "message_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_jobs" FORCE ROW LEVEL SECURITY;
CREATE POLICY message_jobs_tenant_isolation ON "message_jobs"
  USING ("tenant_id" = app_current_tenant())
  WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY message_jobs_platform_scope ON "message_jobs"
  USING (app_platform_scope())
  WITH CHECK (app_platform_scope());

ALTER TABLE "message_replies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_replies" FORCE ROW LEVEL SECURITY;
CREATE POLICY message_replies_tenant_isolation ON "message_replies"
  USING ("tenant_id" = app_current_tenant())
  WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY message_replies_platform_scope ON "message_replies"
  USING (app_platform_scope())
  WITH CHECK (app_platform_scope());

-- A sent message carries when it went out; a pending one does not pretend to.
ALTER TABLE "message_jobs"
  ADD CONSTRAINT message_jobs_sent_has_a_date
  CHECK (("status" = 'SENT') = ("sent_at" IS NOT NULL));

-- Attempts only ever go up, and never below zero.
ALTER TABLE "message_jobs"
  ADD CONSTRAINT message_jobs_attempts_not_negative CHECK ("attempts" >= 0);

-- A portal login belongs to a patient OF THE SAME CLINIC. Without this, a mistaken
-- update could point one clinic's login at another clinic's record — and the portal
-- reads by that id, where RLS would no longer be the thing protecting anyone.
CREATE OR REPLACE FUNCTION app_user_patient_same_tenant() RETURNS trigger AS $$
DECLARE
  patient_tenant uuid;
BEGIN
  IF NEW.patient_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "tenant_id" INTO patient_tenant FROM "patients" WHERE "id" = NEW.patient_id;
  IF patient_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'users_patient_same_tenant: patient % belongs to another clinic', NEW.patient_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_patient_same_tenant
  BEFORE INSERT OR UPDATE OF patient_id, tenant_id ON "users"
  FOR EACH ROW EXECUTE FUNCTION app_user_patient_same_tenant();
