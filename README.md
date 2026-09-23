# Handoff: Sistema de gestão clínica white-label (Dra. Tati Mayumi)

## Overview
Sistema web responsivo e multi-tenant para clínicas de estética injetável. Primeira cliente: Dra. Tati Mayumi (Tatuapé, SP). Mesmo código serve outras clínicas (revenda white-label): cada tenant tem marca, domínio, módulos e usuários próprios.

Módulos: login com perfis, painel, agenda, pacientes, ficha de atendimento (anamnese → procedimento → fotos → fechamento → termo), financeiro/caixa, estoque de insumos, relatórios, lembretes WhatsApp, termos de consentimento, configurações da instância, painel da revenda (tenants), portal da paciente.

## About the Design Files
`design/Sistema Clinica.dc.html` é um **protótipo de referência em HTML** — mostra aparência e comportamento, não é código de produção. A tarefa é **recriar essas telas numa stack real** (sugestão abaixo). Abra o arquivo no navegador (sirva a pasta `design/` com um servidor estático, ex. `npx serve design`). A barra escura no topo NÃO faz parte do produto: é o controle do mockup (troca de marca, perfil e variações).

## Fidelity
**High-fidelity.** Cores, tipografia, espaçamentos e copy são finais. Dados de pacientes são fictícios; dados de custo/preço vêm da planilha real (`data/`).

## Stack (implementada na etapa 1)
- **Next.js 16** (App Router) + TypeScript estrito. **CSS Modules** consumindo os tokens do Classical — sem Tailwind, para que nenhuma cor ou fonte possa ser escrita à mão.
- **PostgreSQL + Prisma 7** (driver adapter `@prisma/adapter-pg`). Multi-tenant por coluna `tenant_id` + **Row Level Security** com `FORCE`.
- **Auth própria**, não Auth.js: cookie httpOnly com token opaco de 256 bits, sessão no banco (`sessions`), 2FA TOTP como passo *dentro* da sessão. A escolha veio da necessidade de revogar sessão, ter o passo intermediário de 2FA, suportar o "entrar como" da revenda e auditar tudo — coisas que o Credentials provider do Auth.js v5 (preso à estratégia JWT) atrapalha.
- Senhas com **scrypt** do próprio Node (sem dependência nativa para compilar no Alpine); **TOTP** implementado sobre RFC 6238, com os vetores oficiais da RFC nos testes.
- Resolução de tenant por hostname (`app.<dominio-da-clinica>`) — `proxy.ts` (era `middleware` até o Next 15) carimba o host; a resolução e todas as decisões de acesso ficam nos guards de servidor.
- Testes: **Vitest** (unitários e integração) e **Playwright** (end-to-end).
- Ícones **Lucide**; fontes **auto-hospedadas** por `next/font` (nenhuma requisição ao Google em produção).

Ainda por escolher, nas etapas em que entram: storage S3-compatível para fotos e PDFs (etapa 4/5 — provável Cloudflare R2, ver ADR 0006 do homelab), WhatsApp Cloud API e fila de jobs (etapa 7).

> **Idioma:** o código é todo em inglês — identificadores, comentários, rotas (`/dashboard`, `/patients`) e colunas do banco. O que a usuária lê é em português do Brasil. Commits em inglês. Ver `CLAUDE.md`.

## Como rodar

**Tudo no Docker** (não depende de nada instalado além do Docker):

```bash
cp .env.example .env          # ajuste SESSION_SECRET: openssl rand -hex 32
npm run docker:up             # banco + migrations + app em http://localhost:3100
npm install && npm run db:seed  # popula as 3 clínicas de exemplo
npm run docker:logs           # acompanha os logs
npm run docker:down           # derruba
```

**Ciclo rápido de desenvolvimento** (app na máquina, banco no Docker):

```bash
npm install
npm run db:up                 # só o Postgres (porta 5434)
npm run db:migrate            # aplica as migrations
npm run db:seed               # 3 clínicas de exemplo + 1 usuário por perfil
npm run dev                   # http://localhost:3100
```

Senha de todos os usuários de desenvolvimento: `prumo1234`.

| Entrar como | E-mail | Endereço |
|---|---|---|
| Doutora (owner, exige 2FA) | `tati@dratatimayumi.com.br` | http://localhost:3100 |
| Recepção (sem 2FA) | `recepcao@dratatimayumi.com.br` | http://localhost:3100 |
| Financeiro | `financeiro@dratatimayumi.com.br` | http://localhost:3100 |
| Profissional convidado | `pedro@dratatimayumi.com.br` | http://localhost:3100 |
| Paciente (portal) | `renata@exemplo.com.br` | http://aurora.localhost:3100 |

Trocar o endereço troca a clínica — é a resolução por hostname funcionando. `tati.localhost:3100`, `aurora.localhost:3100` e `vertice.localhost:3100` servem as três marcas de exemplo, cada uma com sua cor de acento. Endereço desconhecido dá 404, não instância genérica. (O Chromium resolve qualquer `*.localhost` para 127.0.0.1 sozinho, sem mexer em `/etc/hosts`.)

> As portas 3100 e 5434 (em vez de 3000 e 5432) são para não conflitar com outros projetos que já rodam nesta máquina.

### Testes

```bash
npm test          # 142 unitários + integração de RLS e sessão (precisa do db:up)
npm run test:e2e  # 24 end-to-end no Playwright (sobe o dev server sozinho)
npm run test:all  # os dois
npm run typecheck
npm run lint
```

Na primeira vez: `npx playwright install chromium`.

## Estado da implementação

**Etapa 1 concluída** — scaffold, tokens, autenticação com perfis e tenant por hostname:

- Login em alta fidelidade ao protótipo, 2FA obrigatório para perfis com acesso a prontuário (QR gerado no servidor, o segredo não passa por JS de cliente), throttle de 5 tentativas por e-mail+IP em 15 min, mensagem única para e-mail inexistente e senha errada.
- Casca do app: sidebar de 218px, header, tab bar mobile com alvos ≥ 44px, faixa de sessão assumida pela revenda.
- Matriz de permissões da tabela "Perfis e permissões" transcrita em `src/lib/rbac.ts`, com teste que falha se o código divergir do README. Permissão é checada em guard de servidor; o menu só esconde.
- `audit_log` append-only no banco, gravando autenticação, acesso negado e toda visualização de dado sensível.
- Validação de contraste ≥ 3:1 da cor de acento do tenant, já testada (usada pela tela de Configurações na etapa 2).
- Deploy pronto para o homelab: `Dockerfile`, CI (`.github/workflows/`), manifests em `helm/apps/prumo/` e ADR 0010 no repo `homelab`.

As telas dos módulos das etapas 2–8 existem como placeholders que já passam pelos guards, pela resolução de tenant e pela auditoria — elas dizem qual etapa entrega o conteúdo. Ver [`docs/FAQ.md`](docs/FAQ.md) para o uso do sistema e [`docs/operacao.md`](docs/operacao.md) para o runbook de produção.

## Multi-tenant / white-label
Tabela `tenants`: `id, nome, subtitulo, monograma, logo_url, cor_acento (hex), dominio, plano, modulos_habilitados (jsonb), status_cobranca`.
- A cor de acento substitui `--color-accent` e `--brand` em runtime (CSS var no `<html>`). Validar contraste ≥ 3:1 contra `#f3f2f2` ao salvar.
- Feature flags por tenant (tela Configurações): portal da paciente, fotos clínicas, precificação automática, baixa automática de estoque, múltiplos profissionais/comissão, múltiplas unidades.
- Super-admin da revenda vê a lista de tenants, MRR, uso; "Entrar como" abre a instância com faixa de sessão assumida, registrado em log, e **prontuário mascarado** salvo autorização.
- Nome do produto da revenda ainda indefinido (placeholder "Ateliê").

## Perfis e permissões
| Módulo | Doutora (owner) | Recepção | Financeiro | Prof. convidado |
|---|---|---|---|---|
| Agenda | total | total | — | própria |
| Prontuário/anamnese | total | — | — | próprios pacientes |
| Fotos clínicas | total | — | — | parcial |
| Valores e caixa | total | parcial (lançar) | total | — |
| Estoque | total | parcial | total | — |
| Relatórios | total | — | total | — |
| Termos | total | total | — | total |
| Configurações | total | — | — | — |

Mais: **Super-admin revenda** (tenants, config, painel) e **Paciente** (só portal). Menu lateral e tab bar mobile filtram itens pelo perfil. 2FA obrigatório para perfis com acesso a prontuário. Todo acesso a prontuário/foto grava em `audit_log` (LGPD — dados sensíveis de saúde).

## Screens / Views
Desktop: canvas 1280 × 800 dentro de moldura de browser. Mobile: 390 × 812. Layout do app = nav (sidebar 218px OU topbar) + área de conteúdo (header 18/28px padding + scroll com padding 26/28/40px).

1. **Login** — split 1.05fr/.95fr. Esquerda fundo `--color-neutral-900`, monograma em círculo com borda de acento, kicker "Acesso restrito", H1 Cormorant 300 54px. Direita: e-mail, senha, "manter conectado", "Esqueci a senha", botão Entrar, botão "Entrar com verificação em 2 etapas". Mobile: centralizado, + "Entrar com biometria".
2. **Painel** — faixa de 4 KPIs (atendimentos no mês, faturamento, lucro líquido, lucro por hora) com divisórias hairline; lista "Próximos atendimentos de hoje"; card "Lucro por hora" (barras por procedimento); card de pendências (estoque zerado, termos sem assinatura, validade).
3. **Agenda** — três visões (variação): **Dia** (grade de horas 74px/slot, bloco com borda-esquerda 3px de acento, slots livres tracejados, bloqueio listrado, coluna lateral com resumo do dia e ações), **Semana** (6 colunas Seg–Sáb, hoje destacado), **Lista** (tabela com data, hora, paciente, procedimento, sala, status, valor, pagamento). Filtro por sala. Status: Confirmado (tag-accent), Aguardando (tag-outline), Atendido (tag-neutral). Mobile: seletor de dias + cards com "WhatsApp" e "Atender".
4. **Pacientes** — filtros (todos/ativos/retorno vencido/sem termo), tabela (nome+tags, nascimento, telefone, último, próximo, LTV) + painel lateral da paciente (dados, alerta clínico, termo vigente, antes & depois).
5. **Ficha de atendimento** — variação **Etapas** (stepper 5 passos; mobile com barra de progresso e botão "Próxima: X") ou **Tela única** (todas as seções empilhadas). Seções: Anamnese; Procedimento (procedimento, produto/marca, lote, validade, volume, técnica, evolução; baixa automática no estoque); Fotos (4 enquadramentos padronizados, guia fantasma da foto anterior); Fechamento (forma de pagamento, decomposição de custos, lucro e margem); Termo (assinatura em tela ou por link, PDF com hash/IP/horário). Lateral: preço sugerido à vista/parcelado + linha do tempo.
6. **Financeiro** — 5 KPIs; tabela de lançamentos com cobrado, custos, imposto+taxa, lucro, margem (margem < 28% em `--color-accent-700`); card de parâmetros; card de reservas (10% recompra, 5% emergência, restante retirada).
7. **Estoque** — tabela: produto, procedimento, unidade, custo, rendimento, custo/atendimento, quantidade, lote/validade, status (OK/Baixo/Vence/Repor). Botão "Entrada de nota".
8. **Relatórios** — gráfico de barras 6 meses (faturamento contorno, lucro preenchido), mix por linha de procedimento, guia de margem (faixas da aba "Orientação" da planilha). Exportar CSV / PDF para contador.
9. **Mensagens** — automações (24h antes, 48h preparo, pós 1 dia, retorno 14 dias, política de falta, aniversário) com status e métricas; pré-visualização WhatsApp. Resposta "1" confirma, "2" devolve à lista de espera.
10. **Termos** — modelos versionados (nova versão nunca sobrescreve; PDF guarda a versão assinada) + pendências com "Reenviar link".
11. **Configurações** — identidade (nome, subtítulo, domínio, remetente, cor, logo) com prévia ao vivo do login; operação (expediente, duração padrão, antecedência, política de falta); feature flags; matriz de permissões.
12. **Tenants (revenda)** — KPIs (clínicas ativas, MRR, atendimentos, churn) + tabela de clínicas (plano, usuários, módulos, cobrança, "Entrar como").
13. **Portal da paciente** — próximo horário com Confirmar/Reagendar, orientações pré, documentos (termos, recibos).

Mobile: header com monograma + título + avatar; tab bar inferior (Painel, Agenda, Atender, Pacientes, Caixa — filtrada por perfil), alvos ≥ 44px. Módulos gerenciais (financeiro, estoque, relatórios…) abrem em modo leitura resumido no mobile.

## Regras de negócio (da planilha — fonte da verdade em `data/`)
Parâmetros (editáveis por tenant): impostos 6%; maquininha à vista 4,5%; parcelado 15%; custos fixos R$ 4.500/mês; 40 atendimentos/mês → rateio = fixos ÷ atendimentos = R$ 112,50.

- Custo material por atendimento = custo de compra ÷ rendimento (toxina rende 1,5).
- Custo da sala = horas × valor-hora (Tatuapé R$ 77; Parque do Carmo R$ 35).
- Custo total = material + sala + descartáveis + rateio.
- **Preço à vista = custo total ÷ (1 − impostos − taxa à vista − margem)**
- **Preço parcelado = custo total ÷ (1 − impostos − taxa parcelado − margem)**
- Margem padrão 30%. Lucro/atendimento calculado sobre à vista; lucro por hora = lucro ÷ horas.
- Pix/dinheiro não pagam maquininha.
- Realizado: lucro líquido = cobrado − custo total − impostos − taxa conforme pagamento; margem realizada = lucro ÷ cobrado.
- Nunca permitir preço abaixo do custo total (bloquear ou exigir confirmação).
- Alerta para reavaliar custos a cada 3 meses.
- Descartáveis padrão: toxina 40, labial 55, bioestimulador 65, skinbooster 45, mandíbula 55.

Catálogo de materiais e salas: abas "Materiais" e "Salas" da planilha → seed do banco.

## Modelo de dados (mínimo)
`tenants, users (tenant_id, role, 2fa), units/rooms (valor_hora), patients, anamneses (versionada), appointments (patient, room, procedure, product, start, end, status), procedures, products (custo, rendimento, unidade), stock_lots (produto, lote, validade, qtd), stock_movements, encounters/atendimentos (appointment, product_lot, volume, técnica, evolução), photos (encounter, enquadramento, storage_key), payments (forma, valor, taxa aplicada), pricing_params (por tenant, com histórico), consent_templates (versão), consent_signatures (hash, ip, timestamp, pdf_key), message_automations, message_queue, audit_log`.

## State / interações do protótipo
- Clicar num horário da agenda ou paciente abre a ficha de atendimento.
- Salvar fechamento: baixa estoque do lote, gera lançamento financeiro, agenda automação de pós e retorno.
- Troca de perfil re-filtra navegação e redireciona se a tela atual não for permitida.
- Sem animações relevantes; hovers/pressed/focus vêm das classes do design system.

## Design Tokens (Classical — `design/_ds/.../styles.css`)
- Fundo `#f3f2f2`, surface `#eae9e9`, texto `#201f1d`, acento `#b68235` (por tenant), divider = texto a 16%.
- Neutros 100–900: `#f8f4f4 #eae7e7 #d7d3d3 #bab6b6 #9b9797 #7d7979 #605d5d #444141 #2d2b2b`
- Acento 100–900: `#fff3e4 #ffe3bf #facb8d #e1ad66 #c28d41 #a06f24 #7d5411 #5a3b0a #3a270d`
- Fontes: títulos Cormorant Garamond (máx. 600; display em 300/400), corpo Lora. Números tabulares em tabelas/KPIs.
- Espaço: 4.6 / 9.2 / 13.8 / 18.4 / 27.6 / 36.8px. Raio 2 / 4 / 7px. Sombras sm/md/lg sutis.
- Botão primário = contorno de acento, nunca preenchido. Cards com borda, sem preenchimento. Cor como traço/borda.
- Kickers: Lora 9–10px, letter-spacing .18–.22em, caixa alta, neutral-600.
- Tenants de exemplo: Tati `#b68235`, Aurora `#7d5411`, Vértice `#444141`.

## Assets
Sem imagens reais. Fotos antes/depois são placeholders (usar `.plate`). Logo: monograma em círculo até que cada tenant envie o seu. Ícones: Lucide.

## Files

Código:
- `src/lib/` — o núcleo: `db.ts` (fronteira de acesso ao banco, `withTenant`/`withPlatformScope`), `tenant.ts` (resolução por hostname), `rbac.ts` (matriz de permissões), `modules.ts` (catálogo de módulos), `flags.ts`, `color.ts` (contraste do acento), `audit.ts`, `format.ts` (pt-BR), `auth/` (password, totp, session, guards)
- `src/app/login/` — login, 2FA e cadastro do autenticador; `src/app/(app)/` — casca e telas dos módulos
- `src/styles/tokens.css` — cópia dos tokens do Classical (fonte da verdade de cor e tipografia)
- `src/proxy.ts` — carimba o host da requisição (era `middleware.ts` até o Next 15)
- `prisma/schema.prisma`, `prisma/migrations/` (a migration `_rls` tem as policies), `prisma/seed.ts`
- `scripts/create-tenant.ts`, `scripts/reset-password.ts` — operação até a etapa 8
- `tests/` — integração contra o Postgres (RLS, sessão); `e2e/` — Playwright; testes unitários ficam ao lado do código
- `compose.yaml`, `Dockerfile`, `docker/init-db.sql` — execução local e imagem de produção

Referência:
- `design/Sistema Clinica.dc.html` — protótipo (template + lógica; todos os dados de exemplo estão na classe `Component`, em `renderVals()`)
- `design/support.js`, `design/_ds/...` — runtime e design system para abrir o protótipo
- `CLAUDE.md` — instruções para agentes na raiz do repositório
- `docs/FAQ.md` — como usar cada funcionalidade (linguagem de quem opera a clínica)
- `docs/operacao.md` — runbook de produção (criar clínica, redefinir senha, encerrar sessões)

> `data/precificacao_clinica_dra_tati_mayumi.xlsx` — parâmetros, materiais, salas, fórmulas de preço e orientação de margem. **Fora do git**: são os custos e as margens reais da clínica e este repositório é público. Peça o arquivo a quem mantém o projeto e coloque em `data/`.
