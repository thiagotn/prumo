-- CreateEnum
CREATE TYPE "photo_framing" AS ENUM ('FRONT', 'LEFT_PROFILE', 'RIGHT_PROFILE', 'UPPER_THIRD');

-- CreateEnum
CREATE TYPE "photo_status" AS ENUM ('PENDING', 'READY', 'DELETED');

-- CreateTable
CREATE TABLE "clinical_photos" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "framing" "photo_framing" NOT NULL,
    "object_key" TEXT NOT NULL,
    "status" "photo_status" NOT NULL DEFAULT 'PENDING',
    "content_type" TEXT,
    "byte_size" INTEGER,
    "uploaded_by_user_id" UUID,
    "confirmed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinical_photos_object_key_key" ON "clinical_photos"("object_key");

-- CreateIndex
CREATE INDEX "clinical_photos_tenant_id_created_at_idx" ON "clinical_photos"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "clinical_photos_encounter_id_idx" ON "clinical_photos"("encounter_id");

-- CreateIndex
CREATE INDEX "clinical_photos_patient_id_framing_idx" ON "clinical_photos"("patient_id", "framing");

-- AddForeignKey
ALTER TABLE "clinical_photos" ADD CONSTRAINT "clinical_photos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_photos" ADD CONSTRAINT "clinical_photos_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_photos" ADD CONSTRAINT "clinical_photos_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security. Clinical photos are the most sensitive data in the system, so this
-- follows the same shape as every other business table: deny by default, one policy for
-- the tenant slice and one for platform scope, and FORCE because the application role
-- owns the table — without it the owner would bypass the policy and the slice would
-- disappear with no error at all (ADR 0011, decision 7).
ALTER TABLE "clinical_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinical_photos" FORCE ROW LEVEL SECURITY;
CREATE POLICY clinical_photos_tenant_isolation ON "clinical_photos"
  USING ("tenant_id" = app_current_tenant())
  WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY clinical_photos_platform_scope ON "clinical_photos"
  USING (app_platform_scope())
  WITH CHECK (app_platform_scope());

-- The object key has to start with this tenant's prefix. The application builds the key,
-- but a bug there would put one clinic's photo under another's prefix in the bucket,
-- where RLS cannot help — the bucket has no idea what a tenant is.
ALTER TABLE "clinical_photos"
  ADD CONSTRAINT clinical_photos_key_carries_tenant
  CHECK ("object_key" LIKE ('t/' || "tenant_id"::text || '/%'));

-- A confirmed photo has to know what it is: HeadObject fills both before marking it ready.
ALTER TABLE "clinical_photos"
  ADD CONSTRAINT clinical_photos_ready_is_described
  CHECK (
    "status" <> 'READY'
    OR ("content_type" IS NOT NULL AND "byte_size" IS NOT NULL AND "confirmed_at" IS NOT NULL)
  );

ALTER TABLE "clinical_photos"
  ADD CONSTRAINT clinical_photos_size_positive
  CHECK ("byte_size" IS NULL OR "byte_size" > 0);
