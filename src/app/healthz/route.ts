// Kubernetes liveness probe. Deliberately does not touch the database: a database
// outage must not make the kubelet kill a pod that is otherwise healthy.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } });
}
