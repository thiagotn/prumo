-- CreateTable
CREATE TABLE "anamnesis_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "questions" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "current" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anamnesis_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anamneses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "encounter_id" UUID,
    "questions_snapshot" JSONB NOT NULL,
    "answers" JSONB NOT NULL,
    "alert_count" INTEGER NOT NULL DEFAULT 0,
    "template_version" INTEGER NOT NULL,
    "filled_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anamneses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "anamnesis_templates_tenant_id_current_idx" ON "anamnesis_templates"("tenant_id", "current");

-- CreateIndex
CREATE UNIQUE INDEX "anamnesis_templates_tenant_id_version_key" ON "anamnesis_templates"("tenant_id", "version");

-- CreateIndex
CREATE INDEX "anamneses_tenant_id_created_at_idx" ON "anamneses"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "anamneses_patient_id_created_at_idx" ON "anamneses"("patient_id", "created_at");

-- AddForeignKey
ALTER TABLE "anamnesis_templates" ADD CONSTRAINT "anamnesis_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anamneses" ADD CONSTRAINT "anamneses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anamneses" ADD CONSTRAINT "anamneses_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anamneses" ADD CONSTRAINT "anamneses_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "anamnesis_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anamneses" ADD CONSTRAINT "anamneses_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row Level Security. The anamnesis is health data — the same shape as every other
-- business table: deny by default, tenant slice, platform scope, FORCE.
ALTER TABLE "anamnesis_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "anamnesis_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY anamnesis_templates_tenant_isolation ON "anamnesis_templates"
  USING ("tenant_id" = app_current_tenant())
  WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY anamnesis_templates_platform_scope ON "anamnesis_templates"
  USING (app_platform_scope())
  WITH CHECK (app_platform_scope());

ALTER TABLE "anamneses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "anamneses" FORCE ROW LEVEL SECURITY;
CREATE POLICY anamneses_tenant_isolation ON "anamneses"
  USING ("tenant_id" = app_current_tenant())
  WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY anamneses_platform_scope ON "anamneses"
  USING (app_platform_scope())
  WITH CHECK (app_platform_scope());

-- One edition in force per clinic, like the consent terms.
CREATE UNIQUE INDEX anamnesis_templates_one_current
  ON "anamnesis_templates" ("tenant_id")
  WHERE "current";

ALTER TABLE "anamnesis_templates"
  ADD CONSTRAINT anamnesis_templates_version_positive CHECK ("version" >= 1);

-- An anamnesis without the questions it answers is a list of "sim" with nothing to
-- attach them to, and answers are what the whole row exists for.
ALTER TABLE "anamneses"
  ADD CONSTRAINT anamneses_has_questions_and_answers
  CHECK (jsonb_typeof("questions_snapshot") = 'array' AND jsonb_typeof("answers") = 'object');

ALTER TABLE "anamneses"
  ADD CONSTRAINT anamneses_alert_count_not_negative CHECK ("alert_count" >= 0);

-- Append-only: answering again writes a new row. An UPDATE would rewrite what the patient
-- said on a day that has already passed, which is the one thing a versioned record must
-- not allow. Same shape as the audit_log's own guard.
CREATE OR REPLACE FUNCTION app_anamneses_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'anamneses is append-only: answering again writes a new row';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER anamneses_no_update
  BEFORE UPDATE OR DELETE ON "anamneses"
  FOR EACH ROW EXECUTE FUNCTION app_anamneses_append_only();
