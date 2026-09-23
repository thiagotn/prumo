-- CreateTable
CREATE TABLE "pricing_params" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tax_rate" DECIMAL(6,4) NOT NULL,
    "card_fee_upfront" DECIMAL(6,4) NOT NULL,
    "card_fee_installment" DECIMAL(6,4) NOT NULL,
    "fixed_monthly_costs" DECIMAL(12,2) NOT NULL,
    "expected_appointments" INTEGER NOT NULL,
    "default_margin" DECIMAL(6,4) NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_params_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "hourly_rate" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedures" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "disposables_cost" DECIMAL(12,2) NOT NULL,
    "default_duration_hours" DECIMAL(5,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "procedure_id" UUID NOT NULL,
    "room_id" UUID,
    "brand" TEXT NOT NULL,
    "purchase_cost" DECIMAL(12,2) NOT NULL,
    "yield_per_unit" DECIMAL(10,4) NOT NULL,
    "purchase_unit" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "birth_date" DATE,
    "phone" TEXT,
    "email" TEXT,
    "document" TEXT,
    "clinical_alert" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pricing_params_tenant_id_valid_from_idx" ON "pricing_params"("tenant_id", "valid_from");

-- CreateIndex
CREATE INDEX "rooms_tenant_id_idx" ON "rooms"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_tenant_id_name_key" ON "rooms"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "procedures_tenant_id_idx" ON "procedures"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "procedures_tenant_id_name_key" ON "procedures"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "products_tenant_id_idx" ON "products"("tenant_id");

-- CreateIndex
CREATE INDEX "products_procedure_id_idx" ON "products"("procedure_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_procedure_id_brand_key" ON "products"("tenant_id", "procedure_id", "brand");

-- CreateIndex
CREATE INDEX "patients_tenant_id_name_idx" ON "patients"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "patients_tenant_id_document_key" ON "patients"("tenant_id", "document");

-- AddForeignKey
ALTER TABLE "pricing_params" ADD CONSTRAINT "pricing_params_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "procedures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security for the stage 2 tables
-- ─────────────────────────────────────────────────────────────────────────────
-- Same shape as the stage 1 tables: deny by default, one policy for the tenant slice
-- and one for platform scope. FORCE because the application role owns these tables.

ALTER TABLE "pricing_params" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pricing_params" FORCE ROW LEVEL SECURITY;
CREATE POLICY pricing_params_tenant_isolation ON "pricing_params"
  USING ("tenant_id" = app_current_tenant())
  WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY pricing_params_platform_scope ON "pricing_params"
  USING (app_platform_scope())
  WITH CHECK (app_platform_scope());

ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rooms" FORCE ROW LEVEL SECURITY;
CREATE POLICY rooms_tenant_isolation ON "rooms"
  USING ("tenant_id" = app_current_tenant())
  WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY rooms_platform_scope ON "rooms"
  USING (app_platform_scope())
  WITH CHECK (app_platform_scope());

ALTER TABLE "procedures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "procedures" FORCE ROW LEVEL SECURITY;
CREATE POLICY procedures_tenant_isolation ON "procedures"
  USING ("tenant_id" = app_current_tenant())
  WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY procedures_platform_scope ON "procedures"
  USING (app_platform_scope())
  WITH CHECK (app_platform_scope());

ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;
CREATE POLICY products_tenant_isolation ON "products"
  USING ("tenant_id" = app_current_tenant())
  WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY products_platform_scope ON "products"
  USING (app_platform_scope())
  WITH CHECK (app_platform_scope());

-- Patients are health-adjacent data: the isolation here is the one that matters most.
ALTER TABLE "patients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patients" FORCE ROW LEVEL SECURITY;
CREATE POLICY patients_tenant_isolation ON "patients"
  USING ("tenant_id" = app_current_tenant())
  WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY patients_platform_scope ON "patients"
  USING (app_platform_scope())
  WITH CHECK (app_platform_scope());
