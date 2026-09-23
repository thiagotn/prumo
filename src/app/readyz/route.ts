// Readiness probe: here the database counts, because without it the pod serves nothing.
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      { status: 'ok', database: 'ok' },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error('[readyz] database unavailable', error);
    return Response.json(
      { status: 'degraded', database: 'unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
