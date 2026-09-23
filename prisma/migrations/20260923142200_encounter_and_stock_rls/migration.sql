-- Row Level Security and integrity constraints for the stage 4 tables.
--
-- Separate from the migration that created them because that one shipped without these:
-- the tables existed for a few minutes with isolation off. Kept as its own migration
-- rather than folded back, so the fix is replayable in the order it actually happened.

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security — same shape as every other business table: deny by default,
-- one policy for the tenant slice and one for platform scope, FORCE because the
-- application role owns these tables.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "stock_lots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_lots" FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_lots_tenant_isolation ON "stock_lots"
  USING ("tenant_id" = app_current_tenant()) WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY stock_lots_platform_scope ON "stock_lots"
  USING (app_platform_scope()) WITH CHECK (app_platform_scope());

ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_movements" FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_movements_tenant_isolation ON "stock_movements"
  USING ("tenant_id" = app_current_tenant()) WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY stock_movements_platform_scope ON "stock_movements"
  USING (app_platform_scope()) WITH CHECK (app_platform_scope());

-- Encounters hold health data. This is the isolation that matters most in the system.
ALTER TABLE "encounters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "encounters" FORCE ROW LEVEL SECURITY;
CREATE POLICY encounters_tenant_isolation ON "encounters"
  USING ("tenant_id" = app_current_tenant()) WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY encounters_platform_scope ON "encounters"
  USING (app_platform_scope()) WITH CHECK (app_platform_scope());

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY payments_tenant_isolation ON "payments"
  USING ("tenant_id" = app_current_tenant()) WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY payments_platform_scope ON "payments"
  USING (app_platform_scope()) WITH CHECK (app_platform_scope());

-- ─────────────────────────────────────────────────────────────────────────────
-- Constraints that keep the stock ledger honest
-- ─────────────────────────────────────────────────────────────────────────────
-- Stock cannot go negative. Without this, a double-submitted close would quietly take a
-- lot below zero and every later count would be wrong.
ALTER TABLE "stock_lots"
  ADD CONSTRAINT stock_lots_remaining_not_negative CHECK ("quantity_remaining" >= 0);
ALTER TABLE "stock_lots"
  ADD CONSTRAINT stock_lots_remaining_within_received
  CHECK ("quantity_remaining" <= "quantity_received");
ALTER TABLE "stock_lots"
  ADD CONSTRAINT stock_lots_received_positive CHECK ("quantity_received" > 0);

-- A movement of zero explains nothing; it is always a bug.
ALTER TABLE "stock_movements"
  ADD CONSTRAINT stock_movements_quantity_not_zero CHECK ("quantity" <> 0);

-- Instalments only make sense on instalment credit, and there is no such thing as one.
ALTER TABLE "payments"
  ADD CONSTRAINT payments_installments_match_method
  CHECK (
    ("method" = 'CREDIT_INSTALLMENT' AND "installments" IS NOT NULL AND "installments" > 1)
    OR ("method" <> 'CREDIT_INSTALLMENT' AND "installments" IS NULL)
  );

-- A charge is never negative. A courtesy is zero, not a refund.
ALTER TABLE "payments" ADD CONSTRAINT payments_charged_not_negative CHECK ("charged" >= 0);
