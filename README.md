# Prumo

Sistema de gestão clínica **white-label e multi-tenant** para clínicas de estética injetável. Um
código, várias clínicas: cada uma com marca, domínio, módulos e usuários próprios. Primeira cliente:
Dra. Tati Mayumi (Tatuapé, SP).

Prontuário, agenda, ficha de atendimento, financeiro, estoque, relatórios, termos de consentimento,
lembretes por WhatsApp e portal da paciente — com dados sensíveis de saúde, o que define quase todas
as decisões de arquitetura abaixo.

> **Etapas 1 a 5 de 8 concluídas.** Login com perfis, tenant por hostname, cadastro de pacientes,
> configurações, agenda com marcação de horário, estoque por lote, a ficha de atendimento com
> fechamento financeiro e os termos de consentimento com assinatura e PDF estão de pé. As telas dos
> outros módulos são placeholders que já passam por guard, tenant e auditoria, e dizem qual etapa as
> entrega. Ver [Estado](#estado).

---

## Documentação

| Documento | Para que serve |
|---|---|
| [`docs/especificacao.md`](docs/especificacao.md) | **O escopo**: telas, perfis e permissões, white-label, modelo de dados |
| [`docs/regras-de-negocio.md`](docs/regras-de-negocio.md) | Fórmulas de preço, parâmetros e custos (da planilha da clínica) |
| [`docs/design.md`](docs/design.md) | O protótipo de referência e os tokens do design system Classical |
| [`docs/FAQ.md`](docs/FAQ.md) | **Como usar** o sistema, na linguagem de quem opera a clínica |
| [`docs/operacao.md`](docs/operacao.md) | Runbook de produção: criar clínica, redefinir senha, ler auditoria |
| [`CLAUDE.md`](CLAUDE.md) | Convenções do repositório (idioma, testes, execução) para humanos e agentes |

---

## Stack

- **Next.js 16** (App Router) + TypeScript estrito. **CSS Modules** consumindo os tokens do
  Classical — sem Tailwind, para que nenhuma cor ou fonte possa ser escrita à mão.
- **PostgreSQL + Prisma 7** (driver adapter `@prisma/adapter-pg`).
- **Vitest** (unitários e integração) e **Playwright** (end-to-end).
- Ícones **Lucide**; fontes **auto-hospedadas** por `next/font` (nenhuma requisição ao Google em
  produção).
- Deploy no homelab próprio (k3s + Argo CD) — ver [Deploy](#deploy).

### Decisões que valem explicação

**Isolamento entre clínicas é do banco, não da aplicação.** Toda tabela de negócio tem `tenant_id`
sob Row Level Security com `FORCE`, e todo acesso passa por `withTenant()` / `withPlatformScope()`,
que definem o escopo por transação. Sem escopo, nada é visível — o padrão é negar. Consequência
importante: **o role do Postgres da aplicação nunca pode ser superusuário**, porque superusuário
ignora RLS em silêncio e o isolamento desapareceria sem erro nenhum.

**Autenticação é própria, não Auth.js.** Revogar sessão, ter o passo intermediário de 2FA, suportar
o "entrar como" da revenda e auditar tudo exigem estado de sessão no servidor — algo que o
Credentials provider do Auth.js v5, preso à estratégia JWT, atrapalha. O cookie carrega um token
opaco de 256 bits e o banco guarda apenas o HMAC dele. Senhas com **scrypt** do próprio Node (sem
dependência nativa para compilar no Alpine); **TOTP** implementado sobre a RFC 6238 e verificado
contra os vetores de teste da própria RFC.

**Permissão é checada no servidor.** O menu esconde o que o perfil não alcança, mas quem nega é o
guard (`src/lib/auth/guards.ts`). A matriz módulo × perfil é transcrita da
[especificação](docs/especificacao.md#perfis-e-permissões) e um teste falha se o código divergir dela.

**Tenant vem do hostname.** `app.<dominio-da-clinica>` resolve pela tabela `tenant_domains`, então
abrir uma clínica é configuração, não deploy. Hostname desconhecido dá 404, não instância genérica.

**Termos assinados não viram arquivo.** O PDF é montado a cada download a partir da linha do banco
— texto, assinatura, instante, IP — e o hash impresso nele cobre esse conjunto. Não há objeto no
bucket para sair de sincronia com o registro, e a via da paciente e a da clínica saem idênticas por
construção.

Ainda por escolher, nas etapas em que entram: WhatsApp Cloud API e fila de jobs (etapa 7).

---

## Como rodar

**Tudo no Docker** — não depende de nada instalado além do Docker:

```bash
cp .env.example .env            # ajuste SESSION_SECRET: openssl rand -hex 32
npm run docker:up               # banco + migrations + app em http://localhost:3100
npm install && npm run db:seed  # popula as 3 clínicas de exemplo
npm run docker:logs             # acompanha os logs
npm run docker:down             # derruba
```

**Ciclo rápido de desenvolvimento** — app na máquina, banco no Docker:

```bash
npm install
npm run db:up       # só o Postgres (porta 5434)
npm run db:migrate  # aplica as migrations
npm run db:seed     # 3 clínicas de exemplo + 1 usuário por perfil
npm run dev         # http://localhost:3100
```

> Portas 3100 e 5434 em vez de 3000 e 5432 para não conflitar com outros projetos da máquina.

### Usuários de desenvolvimento

Senha de todos: `prumo1234`.

| Entrar como | E-mail | Endereço |
|---|---|---|
| Doutora (owner, exige 2FA) | `owner@dratatimayumi.com.br` | http://localhost:3100 |
| Recepção (sem 2FA) | `recepcao@dratatimayumi.com.br` | http://localhost:3100 |
| Financeiro | `financeiro@dratatimayumi.com.br` | http://localhost:3100 |
| Profissional convidado | `pedro@dratatimayumi.com.br` | http://localhost:3100 |
| Paciente (portal) | `renata@exemplo.com.br` | http://aurora.localhost:3100 |

Trocar o endereço troca a clínica — é a resolução por hostname funcionando. `tati.localhost:3100`,
`aurora.localhost:3100` e `vertice.localhost:3100` servem as três marcas de exemplo, cada uma com
sua cor de acento. O Chromium resolve qualquer `*.localhost` para 127.0.0.1 sozinho, sem mexer em
`/etc/hosts`.

Para ver que o menu não é a proteção: logado como recepção, digite `/settings` na barra de endereço.

### Testes

```bash
npm test          # 314 unitários + integração de RLS e sessão (precisa do db:up)
npm run test:e2e  # 60 end-to-end no Playwright (sobe o dev server sozinho)
npm run test:all  # os dois
npm run typecheck
npm run lint
```

Na primeira vez: `npx playwright install chromium`.

---

## Estrutura

```
src/
  lib/              núcleo, sem UI
    db.ts           fronteira de acesso ao banco: withTenant / withPlatformScope
    tenant.ts       resolução de tenant por hostname
    rbac.ts         matriz de permissões módulo × perfil
    modules.ts      catálogo de módulos (rota, rótulo, grupo, flag, sensível)
    navigation.ts   monta menu e tab bar a partir da matriz + flags
    flags.ts        feature flags por tenant
    color.ts        validação de contraste da cor de acento
    patient.ts      dados de cadastro: CPF, telefone, nascimento (normalização e checagem)
    consent.ts      termos: preenchimento do texto, hash da assinatura, validade do link
    consent-pdf.ts  o PDF do termo assinado (pdf-lib, fontes padrão)
    audit.ts        gravação no audit_log
    format.ts       moeda, datas e nomes em pt-BR
    auth/           password (scrypt), totp (RFC 6238), session, guards
  components/       UI compartilhada entre a casca autenticada e as telas públicas
  app/
    login/          login, 2FA e cadastro do autenticador
    consent/        assinatura do termo por link — pública, sem sessão
    (app)/          casca autenticada + uma pasta por módulo
    healthz, readyz probes para o Kubernetes
  styles/
    tokens.css      cópia dos tokens do Classical — a fonte da verdade de cor e fonte
    globals.css     camada da aplicação sobre os tokens
  proxy.ts          carimba o host da requisição (era middleware.ts até o Next 15)

prisma/             schema, migrations (a `_rls` tem as policies) e seed
scripts/            create-tenant.ts, reset-password.ts — operação até a etapa 8
tests/              integração contra o Postgres: RLS e ciclo de sessão
e2e/                Playwright: login, 2FA, permissões, tenants, mobile
docs/               especificação, regras de negócio, design, FAQ, operação
design/             protótipo de referência — não é código de produção
docker/, compose.yaml, Dockerfile   execução local e imagem de produção
```

Testes unitários ficam ao lado do código (`src/lib/color.test.ts`, e assim por diante).

### Dados da planilha

`data/precificacao_clinica_dra_tati_mayumi.xlsx` tem os parâmetros, materiais, salas, fórmulas de
preço e a orientação de margem. **Fica fora do git**: são os custos e as margens reais da clínica e
este repositório é público. Peça o arquivo a quem mantém o projeto e coloque em `data/`. O que o
código precisa dele está transcrito em [`docs/regras-de-negocio.md`](docs/regras-de-negocio.md).

---

## Estado

**Etapa 1 concluída** — scaffold, tokens, autenticação com perfis e tenant por hostname:

- Login em alta fidelidade ao protótipo; 2FA obrigatório para perfis com acesso a prontuário (QR
  gerado no servidor, o segredo não passa por JavaScript de cliente); throttle de 5 tentativas por
  e-mail+IP em 15 minutos; mensagem única para e-mail inexistente e senha errada.
- Casca do app: sidebar de 218px, header, tab bar mobile com alvos ≥ 44px, faixa de sessão assumida
  pela revenda.
- Matriz de permissões em guard de servidor, com teste que falha se divergir da especificação.
- `audit_log` append-only no banco, gravando autenticação, acesso negado e toda visualização de dado
  sensível.
- Validação de contraste ≥ 3:1 da cor de acento, pronta para a tela de Configurações (etapa 2).

**Etapa 2 concluída** — cadastros e precificação:

- Motor de precificação em `src/lib/pricing.ts`, com as fórmulas da planilha e o caso de referência
  (Restylane Kysse / Tatuapé → R$ 1.142,02 à vista, R$ 1.386,73 parcelado) coberto por teste.
- Parâmetros versionados: salvar cria uma versão nova, então um preço antigo continua explicável.
- Cadastros de salas, procedimentos, produtos e pacientes, todos sob RLS. **Nova paciente** e
  **Editar cadastro** validam CPF (dígitos verificadores), telefone e data de nascimento no
  servidor, e uma recusa devolve o formulário preenchido.
- Tela de Configurações: identidade com prévia do login e validação de contraste ao vivo, parâmetros
  de preço com rateio recalculado na hora, feature flags e a matriz de permissões.
- Tela de Pacientes: filtros, busca, e painel lateral com o alerta clínico em destaque.
- `scripts/import-catalog.ts` importa o catálogo real da planilha, que fica fora do git.

**Etapa 3 concluída** — agenda:

- Três visões sobre os mesmos dados: dia (grade de 8h às 19h), semana (seg–sáb) e lista (14 dias).
- Filtro por sala, navegação por dia/semana, e seletor de dias no celular.
- Bloqueios (almoço, sala não contratada) como entradas sem paciente, com restrição no banco que
  impede um bloqueio com paciente.
- `src/lib/schedule.ts` trabalha no fuso da clínica, não no do servidor — com testes que cobrem
  horário de verão e a virada de dia.
- **Novo agendamento** pelo botão da barra ou clicando na faixa "Livre" da hora desejada, que já
  leva dia, hora e sala. O procedimento preenche a duração típica, e o alerta clínico da paciente
  aparece assim que ela é escolhida.
- Conflito de sala detectado por sobreposição, não por hora cheia (`clashesIn`): a recusa diz com
  quem e em que horário é o choque, e o formulário volta preenchido.
- **Ler não é escrever**: `canWrite` separa consultar de cadastrar/agendar. O profissional
  convidado abre a agenda e as próprias pacientes; quem marca e cadastra é a recepção ou a doutora,
  e o guard nega pelo servidor (`requireModuleWrite`).

**Etapa 4 concluída** — atendimento, estoque e fechamento:

- Fechar um atendimento é uma transação só: grava o pagamento com a decomposição de custos, baixa o
  lote no estoque com o movimento correspondente, e marca o atendimento como atendido.
- O lote consumido é o que vence primeiro, e um lote vencido nunca é escolhido (`src/lib/stock.ts`).
- Cobrar abaixo do custo exige confirmação explícita; a decomposição fica gravada, não recalculada,
  para que um lançamento antigo continue explicável.
- Restrições no banco seguram o resto: estoque não fica negativo, parcelas só existem em crédito
  parcelado, e cobrança não é negativa.

**Etapa 5 concluída** — termos de consentimento:

- Modelos **versionados**: salvar publica a edição seguinte e nunca reescreve a anterior, porque o
  texto que alguém assinou precisa continuar legível como estava. O termo emitido carrega uma
  **cópia** do texto, não um ponteiro para ele.
- Assinatura **em tela** (a paciente assina com o dedo na recepção) ou **por link**: uma página
  pública em `/consent/{token}`, sem sessão, onde o token é a autorização e o tenant vem do
  hostname como em todo o resto.
- Do link só fica guardado o HMAC, como numa sessão: ele aparece uma vez, e gerar outro invalida o
  anterior — que é como se cancela um link enviado por engano. Vale três dias.
- **PDF gerado na hora** (`pdf-lib`), com o texto assinado, a imagem da assinatura, data, IP e o
  **hash SHA-256** do conjunto impresso no rodapé de cada página. Nada é armazenado: as entradas
  param de mudar no instante da assinatura, então o mesmo termo sempre produz o mesmo documento.
- O banco segura o resto: um termo `SIGNED` sem assinatura, sem hash ou sem data é recusado por
  CHECK, um token sem validade também, e um índice parcial garante **uma única edição em vigor**
  por termo.
- Escrever o texto é da doutora (`requireOwnerOf`); emitir, enviar e colher é da recepção.

### Ordem das próximas etapas

| Etapa | Entrega |
|---|---|
| 6 | Financeiro e relatórios |
| 7 | WhatsApp e portal da paciente |
| 8 | Painel da revenda (tenants, flags, "entrar como") |

---

## Deploy

Produção roda no homelab próprio (k3s + Traefik + Cloudflare Tunnel + Argo CD), no repositório
`homelab`:

- `helm/apps/prumo/` — manifests (Deployment com initContainer de migração, Service, Ingress)
- `helm/argocd/application-prumo.yml` — Application do Argo CD
- `helm/postgres/app-db-prumo.yml` — database e role (sem superusuário) no Postgres compartilhado
- `docs/adr/0010-prumo-no-homelab.md` — a decisão de infra e os pré-requisitos out-of-git

O fluxo é GitOps: push em `main` → o CI publica `ghcr.io/thiagotn/prumo:sha-<sha>` e grava a tag em
`helm/apps/prumo/kustomization.yaml` → o Argo CD reconcilia. Detalhes em
[`docs/operacao.md`](docs/operacao.md).

---

## Licença

Software proprietário, todos os direitos reservados. Ver [`LICENSE`](LICENSE). O código está visível
aqui; isso não concede licença de uso, cópia ou redistribuição.
