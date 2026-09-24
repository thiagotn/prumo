-- CreateEnum
CREATE TYPE "consent_status" AS ENUM ('PENDING', 'SIGNED', 'CANCELLED');

-- CreateTable
CREATE TABLE "consent_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "current" BOOLEAN NOT NULL DEFAULT true,
    "procedure_id" UUID,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consent_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "appointment_id" UUID,
    "status" "consent_status" NOT NULL DEFAULT 'PENDING',
    "title_snapshot" TEXT NOT NULL,
    "body_snapshot" TEXT NOT NULL,
    "template_version" INTEGER NOT NULL,
    "token_hash" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "signed_at" TIMESTAMP(3),
    "signer_name" TEXT,
    "signer_note" TEXT,
    "signature_image" BYTEA,
    "signature_hash" TEXT,
    "signed_ip" TEXT,
    "signed_user_agent" TEXT,
    "collected_by_user_id" UUID,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consent_templates_tenant_id_current_idx" ON "consent_templates"("tenant_id", "current");

-- CreateIndex
CREATE UNIQUE INDEX "consent_templates_tenant_id_slug_version_key" ON "consent_templates"("tenant_id", "slug", "version");

-- CreateIndex
CREATE UNIQUE INDEX "consents_token_hash_key" ON "consents"("token_hash");

-- CreateIndex
CREATE INDEX "consents_tenant_id_status_created_at_idx" ON "consents"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "consents_patient_id_created_at_idx" ON "consents"("patient_id", "created_at");

-- CreateIndex
CREATE INDEX "consents_appointment_id_idx" ON "consents"("appointment_id");

-- AddForeignKey
ALTER TABLE "consent_templates" ADD CONSTRAINT "consent_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_templates" ADD CONSTRAINT "consent_templates_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "procedures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "consent_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row Level Security, the same shape as every other business table: deny by default, one
-- policy for the tenant slice, one for platform scope, and FORCE because the application
-- role owns the table — without it the owner bypasses the policy and the isolation is
-- gone with no error at all.
ALTER TABLE "consent_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consent_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY consent_templates_tenant_isolation ON "consent_templates"
  USING ("tenant_id" = app_current_tenant())
  WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY consent_templates_platform_scope ON "consent_templates"
  USING (app_platform_scope())
  WITH CHECK (app_platform_scope());

ALTER TABLE "consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consents" FORCE ROW LEVEL SECURITY;
CREATE POLICY consents_tenant_isolation ON "consents"
  USING ("tenant_id" = app_current_tenant())
  WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY consents_platform_scope ON "consents"
  USING (app_platform_scope())
  WITH CHECK (app_platform_scope());

-- One current edition per term. A partial unique index rather than application code:
-- two "current" editions would make "which one do we hand the patient today" ambiguous.
CREATE UNIQUE INDEX consent_templates_one_current_per_slug
  ON "consent_templates" ("tenant_id", "slug")
  WHERE "current";

-- Editions start at 1 and go up.
ALTER TABLE "consent_templates"
  ADD CONSTRAINT consent_templates_version_positive CHECK ("version" >= 1);

-- A signed term carries its proof: when, who, and the hash over what was shown. Without
-- this, a half-written signature would be indistinguishable from a real one.
ALTER TABLE "consents"
  ADD CONSTRAINT consents_signed_is_complete
  CHECK (
    "status" <> 'SIGNED'
    OR (
      "signed_at" IS NOT NULL
      AND "signer_name" IS NOT NULL
      AND "signature_hash" IS NOT NULL
      AND "signature_image" IS NOT NULL
    )
  );

-- And a term that is not signed has no signature date, so "pending" can never look
-- signed by accident.
ALTER TABLE "consents"
  ADD CONSTRAINT consents_unsigned_has_no_date
  CHECK ("status" = 'SIGNED' OR "signed_at" IS NULL);

-- A signing link is a token WITH an expiry. A token that never expires is a permanent
-- key to a health document sitting in someone's WhatsApp history.
ALTER TABLE "consents"
  ADD CONSTRAINT consents_token_has_expiry
  CHECK (("token_hash" IS NULL) = ("token_expires_at" IS NULL));

-- The signature image is a drawing, not a file upload: 256 KB is already generous.
ALTER TABLE "consents"
  ADD CONSTRAINT consents_signature_image_is_small
  CHECK ("signature_image" IS NULL OR octet_length("signature_image") <= 262144);
