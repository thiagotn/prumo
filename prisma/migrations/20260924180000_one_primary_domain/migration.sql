-- A clinic can answer on several hostnames — one under the product's domain, one under
-- its own — and the code now has to name ONE of them when it writes a link for a patient
-- or hands a support session over. `primary` is that answer, so the database has to
-- guarantee there is at most one per clinic; until now the column was written and never
-- read, and nothing stopped two.
--
-- Partial unique index rather than a constraint: the rule is "one row with primary true",
-- not "one row". Same shape as anamnesis_templates_one_current.
CREATE UNIQUE INDEX "tenant_domains_one_primary"
    ON "tenant_domains" ("tenant_id")
 WHERE "primary";
