#!/usr/bin/env bash
#
# Opens an SSH tunnel to the production Postgres, so the operational scripts in this
# folder can run against it from a workstation.
#
#   PRUMO_NODE=user@host ./scripts/tunnel-prod-db.sh
#
# Why a tunnel and not `kubectl port-forward`: the shared Postgres Service is headless,
# so it has no ClusterIP — it resolves to a pod IP in the pod CIDR, which the mesh's
# subnet router does not advertise. The cluster node reaches that pod directly, so we
# forward through it. This also means no kubectl or kubeconfig is needed locally.
#
# Nothing here is secret: the node address comes from the environment and the database
# password is never handled — build DATABASE_URL from the cluster Secret instead (the
# script prints how). Ctrl-C closes the tunnel.
# Uses bash features (here-strings, indirect expansion). Invoked as `sh script.sh`, the
# shell would be dash, which reads line by line and only fails deep into the run with
# "Syntax error: redirection unexpected". Re-exec under bash so `sh`, `bash` and `./`
# all behave the same.
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

# SSH target of the cluster node, e.g. "someone@10.0.0.2" or a host from ~/.ssh/config.
NODE="${PRUMO_NODE:-}"
# 5432 and 5433 are commonly taken by other local databases; 5435 keeps this separate and
# makes it obvious in a connection string that you are pointed at production.
PORT="${PRUMO_DB_PORT:-5435}"
PG_NAMESPACE="${PRUMO_PG_NAMESPACE:-postgres}"
PG_POD="${PRUMO_PG_POD:-postgres-0}"
APP_NAMESPACE="${PRUMO_NAMESPACE:-prumo}"

if [ -z "$NODE" ]; then
  cat >&2 <<'HELP'
PRUMO_NODE is not set — it is the SSH target of the cluster node.

  PRUMO_NODE=user@host ./scripts/tunnel-prod-db.sh

Optional: PRUMO_DB_PORT (default 5435), PRUMO_PG_NAMESPACE (postgres),
PRUMO_PG_POD (postgres-0), PRUMO_NAMESPACE (prumo).
HELP
  exit 2
fi

if command -v ss >/dev/null && ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
  echo "Port ${PORT} is already in use. Set PRUMO_DB_PORT to a free one." >&2
  exit 1
fi

echo "Resolving the Postgres pod address…"
# The pod IP changes on every restart, so it is resolved at start rather than stored.
POD_IP=$(ssh -o BatchMode=yes "$NODE" \
  "kubectl -n ${PG_NAMESPACE} get pod ${PG_POD} -o jsonpath='{.status.podIP}'")
[ -n "$POD_IP" ] || { echo "Could not resolve the IP of pod ${PG_POD}." >&2; exit 1; }

cat <<INFO
Pod:    ${POD_IP}
Tunnel: localhost:${PORT} -> ${POD_IP}:5432 (via ${NODE})

This points at the PRODUCTION database. In another terminal:

  export DATABASE_URL="\$(ssh ${NODE} \\
    "kubectl -n ${APP_NAMESPACE} get secret prumo-db -o jsonpath='{.data.DATABASE_URL}' | base64 -d" \\
    | sed 's|@postgres.${PG_NAMESPACE}.svc.cluster.local:5432|@localhost:${PORT}|')"

That reads the password straight from the cluster Secret, so it never reaches your
shell history or a file. Ctrl-C here closes the tunnel.
INFO

exec ssh -o BatchMode=yes -o ExitOnForwardFailure=yes -N -L "${PORT}:${POD_IP}:5432" "$NODE"
