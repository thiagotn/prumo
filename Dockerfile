# Imagem do Prumo — Next.js standalone, no padrão do churrasquin-web do homelab:
# uma imagem só, que serve tanto o servidor quanto o initContainer de migração
# (`prisma migrate deploy`), como manda a ADR 0008.
#
# Estágios: deps (npm ci) → build (generate + next build) → cli (CLI do Prisma
# isolado e podado) → runtime (só o necessário, rodando como uid 1000).

# ── deps ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── build ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# URL de mentira só para o build: `prisma generate` e `next build` NÃO conectam no
# banco, mas prisma.config.ts exige a variável presente. A real vem do secret
# `prumo-db` em runtime. Manter a config estrita é de propósito: em dev, .env
# faltando falha na hora em vez de conectar no lugar errado.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npx next build

# ── cli ───────────────────────────────────────────────────────────────────────
# O CLI do Prisma instalado sozinho, só para o `migrate deploy` do initContainer.
# Instalado à parte de propósito: assim as devDependencies do app (typescript,
# vitest, eslint, next) não entram na imagem final.
#
# Não tente podar o CLI: o binário do Prisma 7 carrega @prisma/studio-core e effect
# na inicialização, mesmo para `migrate deploy` — tirar qualquer um deles faz o CLI
# morrer com MODULE_NOT_FOUND. Isso deixa a imagem grande (~700MB); a alternativa
# seria aplicar as migrations com psql, mas aí a tabela _prisma_migrations passaria
# a ser mantida à mão. Fica como está, no padrão da ADR 0008 (uma imagem só).
FROM node:22-alpine AS cli
WORKDIR /cli
RUN npm init -y > /dev/null \
 && npm i --omit=dev --no-audit --no-fund prisma@7.10.0 dotenv@17 \
 && node node_modules/prisma/build/index.js --version

# ── runtime ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# O standalone traz só o que o servidor precisa; static e public vão à mão.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Migração: schema, migrations, config e o CLI. O node_modules do CLI é mesclado
# ao do standalone — os subpacotes não colidem (o standalone traz @prisma/client
# gerado, o CLI traz @prisma/config e engines).
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=cli /cli/node_modules ./node_modules

# USER node (uid 1000) — o securityContext do Deployment fixa o mesmo uid.
USER node
EXPOSE 3000

# Probes: /healthz (liveness, sem banco) e /readyz (readiness, com banco).
# O initContainer sobrescreve o command com `prisma migrate deploy`.
CMD ["node", "server.js"]
