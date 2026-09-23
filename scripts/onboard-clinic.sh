#!/usr/bin/env bash
#
# Onboards a clinic on the homelab: routes its hostname through the Cloudflare Tunnel
# and registers the clinic plus its owner user. Run this ON THE CLUSTER NODE.
#
#   ./onboard-clinic.sh --host app.clinic.example --name "Clinic" --monogram CL \
#     --color '#b68235' --owner-name "Dr. Someone" --owner-email someone@clinic.example
#
# It uses only what a k3s node already has: kubectl, curl, jq, openssl and python3 — no
# Node.js and no cloudflared CLI (whose cert.pem normally lives on a workstation, not on
# the node). The DNS record is created through the Cloudflare API using the token the
# cluster already holds for cert-manager's DNS-01 challenges.
#
# IDEMPOTENT: re-running changes nothing that is already correct. Each step checks first.
#
#   --dry-run     inspect and report, change nothing
#   --only-dns    stop after the DNS record
#
# The remaining two steps of onboarding are in git, not here: the tunnel ingress rule in
# helm/cloudflared/configmap.yml and the host in helm/apps/prumo/ingress.yml. Add those
# and let Argo sync them BEFORE running this. See ADR 0010 in the homelab repo.
# Uses bash features (here-strings, indirect expansion). Invoked as `sh script.sh`, the
# shell would be dash, which reads line by line and only fails deep into the run with
# "Syntax error: redirection unexpected". Re-exec under bash so `sh`, `bash` and `./`
# all behave the same.
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

# Nothing sensitive is hardcoded: the tunnel id is read from the cluster, and the clinic
# details come from flags.
HOSTNAME_APP=""
ZONE=""
CLINIC_NAME=""
CLINIC_SUBTITLE=""
CLINIC_MONOGRAM=""
CLINIC_COLOR=""
CLINIC_UNIT=""
CLINIC_PLAN="ESSENTIAL"        # ESSENTIAL | CLINIC | NETWORK
CLINIC_BILLING="TRIAL"         # ACTIVE | PAST_DUE | TRIAL | SUSPENDED
OWNER_NAME=""
OWNER_EMAIL=""
APP_NAMESPACE="${PRUMO_NAMESPACE:-prumo}"
PG_NAMESPACE="${PRUMO_PG_NAMESPACE:-postgres}"
DRY_RUN=false
ONLY_DNS=false

uso() { sed -n '3,20p' "$0"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --host)        HOSTNAME_APP="$2"; shift 2 ;;
    --zone)        ZONE="$2"; shift 2 ;;
    --name)        CLINIC_NAME="$2"; shift 2 ;;
    --subtitle)    CLINIC_SUBTITLE="$2"; shift 2 ;;
    --monogram)    CLINIC_MONOGRAM="$2"; shift 2 ;;
    --color)       CLINIC_COLOR="$2"; shift 2 ;;
    --unit)        CLINIC_UNIT="$2"; shift 2 ;;
    --plan)        CLINIC_PLAN="$2"; shift 2 ;;
    --billing)     CLINIC_BILLING="$2"; shift 2 ;;
    --owner-name)  OWNER_NAME="$2"; shift 2 ;;
    --owner-email) OWNER_EMAIL="$2"; shift 2 ;;
    --dry-run)     DRY_RUN=true; shift ;;
    --only-dns)    ONLY_DNS=true; shift ;;
    -h|--help)     uso; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

heading() { printf '\n\033[1m-- %s\033[0m\n' "$1"; }
ok()      { printf '  \033[32mok\033[0m    %s\n' "$1"; }
warn()    { printf '  \033[33m!\033[0m     %s\n' "$1"; }
fail()    { printf '  \033[31mERROR\033[0m %s\n' "$1" >&2; exit 1; }
step()    { printf '  ->    %s\n' "$1"; }

[ -n "$HOSTNAME_APP" ] || fail "--host is required (e.g. app.clinic.example)."
# The zone defaults to the hostname without its first label: app.clinic.example -> clinic.example
[ -n "$ZONE" ] || ZONE="${HOSTNAME_APP#*.}"

heading "0. Prerequisites"
for c in kubectl curl jq openssl python3; do
  command -v "$c" >/dev/null || fail "$c is not installed on this host."
done
python3 - <<'PY' || fail "this python3 has no hashlib.scrypt (needs OpenSSL 1.1+)."
import hashlib
hashlib.scrypt(b'x', salt=b'y', n=2, r=8, p=1, dklen=32)
PY
ok "kubectl, curl, jq, openssl and python3 with scrypt available"

READY=$(kubectl -n "$APP_NAMESPACE" get deploy prumo -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0)
[ "${READY:-0}" -ge 1 ] || fail "the prumo Deployment has no ready replica in namespace ${APP_NAMESPACE}."
ok "prumo Deployment ready (${READY} replica(s))"

$DRY_RUN && warn "--dry-run: nothing will be changed"

heading "1. DNS - CNAME for ${HOSTNAME_APP}"

# Read the tunnel id from the cluster instead of carrying it in the repo. It also cannot
# drift from what cloudflared is actually running.
TUNNEL_ID=$(kubectl -n cloudflared get cm cloudflared-config -o jsonpath='{.data.config\.yaml}' 2>/dev/null \
  | sed -nE 's/^[[:space:]]*tunnel:[[:space:]]*([0-9a-f-]+).*/\1/p' | head -1)
[ -n "$TUNNEL_ID" ] || fail "could not read the tunnel id from the cloudflared-config ConfigMap."
ok "tunnel id read from the cluster"

TARGET="${TUNNEL_ID}.cfargotunnel.com"

if ! kubectl -n cloudflared get cm cloudflared-config -o jsonpath='{.data.config\.yaml}' | grep -q "hostname: ${HOSTNAME_APP}\b"; then
  warn "${HOSTNAME_APP} has no ingress rule in cloudflared-config yet."
  warn "Add it to helm/cloudflared/configmap.yml, let Argo sync, then run:"
  warn "  kubectl -n cloudflared rollout restart deploy/cloudflared"
  warn "Without that the hostname falls through to the catch-all and answers an empty 404."
fi

# cert-manager's DNS-01 token already carries Zone:Read and DNS:Edit for these zones.
CF_TOKEN=$(kubectl -n cert-manager get secret cloudflare-api-token -o jsonpath='{.data.api-token}' 2>/dev/null | base64 -d || true)
[ -n "$CF_TOKEN" ] || fail "could not read the cloudflare-api-token Secret from cert-manager."
ok "Cloudflare token read from the cluster (never printed)"

cf_api() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" "https://api.cloudflare.com/client/v4${path}" \
      -H "Authorization: Bearer ${CF_TOKEN}" -H 'Content-Type: application/json' --data "$body"
  else
    curl -sS -X "$method" "https://api.cloudflare.com/client/v4${path}" \
      -H "Authorization: Bearer ${CF_TOKEN}"
  fi
}

RESP=$(cf_api GET "/zones?name=${ZONE}")
if [ "$(jq -r '.success' <<<"$RESP")" != "true" ]; then
  printf '  \033[31mERROR\033[0m the Cloudflare API refused the zone lookup:\n' >&2
  jq -r '.errors[]? | "        [\(.code)] \(.message)"' <<<"$RESP" >&2
  echo "  Fallback: create a proxied CNAME ${HOSTNAME_APP} -> ${TARGET} in the dashboard," >&2
  echo "  or run 'cloudflared tunnel route dns' from the machine holding cert.pem." >&2
  exit 1
fi
ZONE_ID=$(jq -r '.result[0].id // empty' <<<"$RESP")
[ -n "$ZONE_ID" ] || fail "zone ${ZONE} not found in this Cloudflare account."
ok "zone ${ZONE} found"

RESP=$(cf_api GET "/zones/${ZONE_ID}/dns_records?name=${HOSTNAME_APP}")
RECORD_ID=$(jq -r '.result[0].id // empty' <<<"$RESP")
RECORD_TYPE=$(jq -r '.result[0].type // empty' <<<"$RESP")
RECORD_CONTENT=$(jq -r '.result[0].content // empty' <<<"$RESP")

BODY=$(jq -nc --arg n "$HOSTNAME_APP" --arg c "$TARGET" \
  '{type:"CNAME", name:$n, content:$c, proxied:true, ttl:1, comment:"Prumo - clinic management"}')

if [ -z "$RECORD_ID" ]; then
  if $DRY_RUN; then
    warn "--dry-run: would create CNAME ${HOSTNAME_APP} -> ${TARGET} (proxied)"
  else
    RESP=$(cf_api POST "/zones/${ZONE_ID}/dns_records" "$BODY")
    [ "$(jq -r '.success' <<<"$RESP")" = "true" ] \
      || { jq -r '.errors[]? | "        [\(.code)] \(.message)"' <<<"$RESP" >&2; fail "could not create the record."; }
    ok "CNAME created: ${HOSTNAME_APP} -> ${TARGET} (proxied)"
  fi
elif [ "$RECORD_TYPE" = "CNAME" ] && [ "$RECORD_CONTENT" = "$TARGET" ]; then
  ok "CNAME was already correct - nothing to do"
else
  step "a ${RECORD_TYPE} record points at ${RECORD_CONTENT} - overwriting"
  if $DRY_RUN; then
    warn "--dry-run: would replace it with a CNAME -> ${TARGET}"
  else
    RESP=$(cf_api PUT "/zones/${ZONE_ID}/dns_records/${RECORD_ID}" "$BODY")
    [ "$(jq -r '.success' <<<"$RESP")" = "true" ] \
      || { jq -r '.errors[]? | "        [\(.code)] \(.message)"' <<<"$RESP" >&2; fail "could not overwrite the record."; }
    ok "CNAME overwritten: ${HOSTNAME_APP} -> ${TARGET} (proxied)"
  fi
fi
unset CF_TOKEN

heading "2. Public path"
if $DRY_RUN; then
  warn "--dry-run: skipped (no record was created)"
else
  for _ in $(seq 1 20); do getent hosts "$HOSTNAME_APP" >/dev/null 2>&1 && break; sleep 3; done
  getent hosts "$HOSTNAME_APP" >/dev/null 2>&1 \
    && ok "${HOSTNAME_APP} resolves" \
    || warn "not resolving here yet - could be the local resolver cache"

  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://${HOSTNAME_APP}/healthz" || echo 000)
  [ "$CODE" = "200" ] \
    && ok "https://${HOSTNAME_APP}/healthz answers 200" \
    || warn "healthz answered HTTP ${CODE} - check: kubectl -n cloudflared logs deploy/cloudflared --tail=30"
fi

$ONLY_DNS && { heading "3. Clinic - skipped (--only-dns)"; exit 0; }

heading "3. Clinic and owner"

for campo in CLINIC_NAME CLINIC_MONOGRAM CLINIC_COLOR OWNER_NAME OWNER_EMAIL; do
  [ -n "${!campo}" ] || fail "--${campo,,} is required to register the clinic (or use --only-dns)."
done

# Same rule the application enforces before saving an accent colour: at least 3:1 against
# the Classical background, or the primary button's outline disappears into the paper.
CONTRAST=$(CLINIC_COLOR="$CLINIC_COLOR" python3 - <<'PY'
import os, re, sys
hexo = os.environ['CLINIC_COLOR'].strip().lower().lstrip('#')
if len(hexo) == 3:
    hexo = ''.join(c * 2 for c in hexo)
if not re.fullmatch(r'[0-9a-f]{6}', hexo):
    print('INVALID'); sys.exit(0)
def lum(h):
    canais = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    canais = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in canais]
    return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2]
a, b = lum(hexo), lum('f3f2f2')
claro, escuro = max(a, b), min(a, b)
print(f'{(claro + 0.05) / (escuro + 0.05):.2f}')
PY
)
[ "$CONTRAST" != "INVALID" ] || fail "--color must be a hex colour, e.g. #b68235."
awk "BEGIN{exit !($CONTRAST >= 3)}" \
  || fail "accent colour contrast is ${CONTRAST}:1 against #f3f2f2; the minimum is 3:1. Pick a darker tone."
ok "accent colour accepted (contrast ${CONTRAST}:1)"

psql_prumo() { kubectl -n "$PG_NAMESPACE" exec -i sts/postgres -- psql -U postgres -d prumo -v ON_ERROR_STOP=1 "$@"; }

EXISTS=$(psql_prumo -tAc "SELECT count(*) FROM tenants WHERE domain = '${ZONE}'" 2>/dev/null | tr -d '[:space:]' || echo 0)
if [ "${EXISTS:-0}" != "0" ]; then
  ok "clinic ${ZONE} is already registered - nothing to do"
elif $DRY_RUN; then
  warn "--dry-run: would register ${CLINIC_NAME} and owner ${OWNER_EMAIL}"
else
  # Generated here, in hex: survives any quoting and never lands in argv.
  PASSWORD=$(openssl rand -hex 9)

  # Same format as src/lib/auth/password.ts: scrypt$N$r$p$saltB64$hashB64, N=2^17, r=8,
  # p=1, 32-byte key, 16-byte salt, NFKC-normalised password.
  HASH=$(PASSWORD="$PASSWORD" python3 - <<'PY'
import base64, hashlib, os, unicodedata
senha = unicodedata.normalize('NFKC', os.environ['PASSWORD']).encode()
salt = os.urandom(16)
chave = hashlib.scrypt(senha, salt=salt, n=2**17, r=8, p=1, dklen=32, maxmem=256 * 1024 * 1024)
print(f"scrypt$131072$8$1${base64.b64encode(salt).decode()}${base64.b64encode(chave).decode()}")
PY
)
  ok "initial password generated and scrypt hash computed"

  # Runs as the Postgres superuser, which bypasses RLS on purpose: this is the
  # provisioning path. The application itself connects as a non-superuser role, so its
  # queries stay inside the per-tenant slice. Values travel as psql variables (:'name'),
  # which psql quotes - nothing is concatenated into the statement.
  psql_prumo \
    -v name="$CLINIC_NAME" -v subtitle="$CLINIC_SUBTITLE" -v monogram="$CLINIC_MONOGRAM" \
    -v color="$CLINIC_COLOR" -v domain="$ZONE" -v host="$HOSTNAME_APP" -v unit="$CLINIC_UNIT" \
    -v plan="$CLINIC_PLAN" -v billing="$CLINIC_BILLING" \
    -v owner_name="$OWNER_NAME" -v owner_email="$OWNER_EMAIL" -v hash="$HASH" <<'SQL'
BEGIN;

-- id and updated_at have no database default: Prisma generates them client-side, so the
-- INSERT has to supply both.
WITH new_clinic AS (
  INSERT INTO tenants (
    id, name, subtitle, monogram, accent_color, domain, default_unit,
    plan, billing_status, enabled_modules, active, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), :'name', nullif(:'subtitle', ''), :'monogram', :'color', :'domain',
    nullif(:'unit', ''), :'plan'::plan, :'billing'::billing_status,
    '{"patientPortal":false,"clinicalPhotos":true,"automaticPricing":true,
      "automaticStockDeduction":true,"multiplePractitioners":false,"multipleUnits":false}'::jsonb,
    true, now(), now()
  )
  RETURNING id
)
INSERT INTO tenant_domains (id, tenant_id, host, "primary", created_at)
SELECT gen_random_uuid(), id, :'host', true, now() FROM new_clinic;

INSERT INTO users (
  id, tenant_id, name, email, password_hash, role, active, created_at, updated_at
)
SELECT gen_random_uuid(), t.id, :'owner_name', lower(:'owner_email'), :'hash', 'OWNER'::role,
       true, now(), now()
FROM tenants t WHERE t.domain = :'domain';

COMMIT;
SQL

  ok "clinic and owner registered"
  printf '\n  \033[1mInitial password for %s:\033[0m  %s\n' "$OWNER_EMAIL" "$PASSWORD"
  printf '  Hand it over through a secure channel. Nothing but its hash is stored.\n'
  printf '  The owner role reaches medical records, so 2FA is enrolled on first sign-in.\n\n'
  unset PASSWORD HASH
fi

heading "4. Final check"
$DRY_RUN && { warn "--dry-run: nothing was changed"; exit 0; }

TRAEFIK=$(kubectl -n traefik get svc traefik -o jsonpath='{.spec.clusterIP}')
curl -s --max-time 10 -H "Host: ${HOSTNAME_APP}" "http://${TRAEFIK}/login" | grep -q 'Acesso restrito' \
  && ok "the sign-in page renders with the clinic branding (from inside the cluster)" \
  || warn "not rendering yet - check: kubectl -n ${APP_NAMESPACE} logs deploy/prumo --tail=30"

CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://${HOSTNAME_APP}/login" || echo 000)
[ "$CODE" = "200" ] \
  && printf '\n  \033[1mLive: https://%s\033[0m\n\n' "$HOSTNAME_APP" \
  || warn "https://${HOSTNAME_APP}/login answered HTTP ${CODE} - if DNS was just created, wait a minute"
