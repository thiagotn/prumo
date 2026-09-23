// Configuração da CLI do Prisma 7 (migrate/generate/studio).
// A URL de conexão sai daqui; o runtime do app usa o adapter em src/lib/db.ts.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
