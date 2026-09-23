-- Multi-tenant isolation enforced by the database (CLAUDE.md: "every query filters
-- by tenant — RLS in Postgres").
--
-- Design:
--   * `app.tenant_id`     — set per transaction by withTenant() (src/lib/db.ts).
--   * `app.platform_scope` — 'on' only in reseller/seed scope (withPlatformScope()).
--   * With neither of them set, NOTHING is visible: the default is to deny, not leak.
--
-- `tenants` and `tenant_domains` stay outside RLS on purpose: they are the platform
-- registry and have to be readable BEFORE we know the tenant (hostname resolution).
-- They are protected at the application layer — only platform scope writes to them.

-- ─────────────────────────────────────────────────────────────────────────────
-- Context functions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
  LANGUAGE sql
  STABLE
  AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

COMMENT ON FUNCTION app_current_tenant() IS
  'Tenant of the current transaction, set by withTenant(). NULL outside tenant scope.';

CREATE OR REPLACE FUNCTION app_platform_scope() RETURNS boolean
  LANGUAGE sql
  STABLE
  AS $$ SELECT coalesce(current_setting('app.platform_scope', true), '') = 'on' $$;

COMMENT ON FUNCTION app_platform_scope() IS
  'True in reseller/seed scope (withPlatformScope()). Bypasses the per-tenant slice.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Policies per business table
-- ─────────────────────────────────────────────────────────────────────────────
-- FORCE is required because the application role OWNS these tables — without it the
-- owner would bypass the policies and RLS would be decorative.
--
-- NOTE: a superuser bypasses RLS entirely, FORCE or not. The application role must
-- never be a superuser (see docker/init-db.sql and helm/postgres/app-db-prumo.yml).

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY users_tenant_isolation ON "users"
  USING ("tenant_id" = app_current_tenant())
  WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY users_platform_scope ON "users"
  USING (app_platform_scope())
  WITH CHECK (app_platform_scope());

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY sessions_tenant_isolation ON "sessions"
  USING ("tenant_id" = app_current_tenant())
  WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY sessions_platform_scope ON "sessions"
  USING (app_platform_scope())
  WITH CHECK (app_platform_scope());

ALTER TABLE "login_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "login_attempts" FORCE ROW LEVEL SECURITY;
CREATE POLICY login_attempts_tenant_isolation ON "login_attempts"
  USING ("tenant_id" = app_current_tenant())
  WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY login_attempts_platform_scope ON "login_attempts"
  USING (app_platform_scope())
  WITH CHECK (app_platform_scope());

-- audit_log is append-only: there are SELECT and INSERT policies and NO policy for
-- UPDATE or DELETE. With FORCE that holds even for the table owner — an UPDATE or
-- DELETE coming from the application matches no rows and does nothing.
--
-- Why policies and not a RULE (`DO INSTEAD NOTHING`) or a trigger that raises: both
-- break Postgres' ON DELETE actions. The referential integrity check notices the row
-- was not removed and aborts the whole transaction with XX000 ("gave unexpected
-- result"), making it impossible to delete a tenant or a user. Referential integrity
-- queries, on the other hand, deliberately BYPASS RLS — so the FK's SetNull keeps
-- working with the policies below.
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_log_read_tenant ON "audit_log"
  FOR SELECT USING ("tenant_id" = app_current_tenant());
CREATE POLICY audit_log_read_platform ON "audit_log"
  FOR SELECT USING (app_platform_scope());
CREATE POLICY audit_log_insert_tenant ON "audit_log"
  FOR INSERT WITH CHECK ("tenant_id" = app_current_tenant());
CREATE POLICY audit_log_insert_platform ON "audit_log"
  FOR INSERT WITH CHECK (app_platform_scope());

-- ─────────────────────────────────────────────────────────────────────────────
-- Email uniqueness for the reseller's SUPERADMIN
-- ─────────────────────────────────────────────────────────────────────────────
-- users_tenant_id_email_key does not cover tenant_id IS NULL: in Postgres NULLs are
-- distinct from each other, so two superadmins could share an email address.
CREATE UNIQUE INDEX "users_platform_email_key"
  ON "users" ("email")
  WHERE "tenant_id" IS NULL;
