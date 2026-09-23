# CLAUDE.md — Sistema de gestão clínica white-label

Leia `README.md` antes de qualquer tarefa. O protótipo em `design/` é referência visual/comportamental; não copie o HTML.

## Idioma: código em inglês, produto em português
- **Código em inglês, sempre**: identificadores, comentários, nomes de arquivo e de pasta, rotas
  (`/dashboard`, `/patients`), modelos e colunas do banco, nomes de teste, mensagens de log e de erro
  interno.
- **Produto em português do Brasil**: todo texto que a usuária lê — rótulos, títulos, mensagens de
  validação, e-mails, PDFs. Tom sóbrio clínico. Moeda e datas em `pt-BR` (BRL).
- **Commits e pull requests em inglês**, no imperativo (`add patient search`, não `added`/`adds`).
- Documentação (`README.md`, `docs/`, este arquivo) segue em português — é material do time.
- Vocabulário do domínio, para não divergir: prontuário = `medicalRecord`, anamnese = `anamnesis`,
  ficha de atendimento = `encounter`, agenda = `schedule`, paciente = `patient`, sala = `room`,
  insumo/material = `product`, lote = `stockLot`, termo de consentimento = `consent`,
  profissional convidado = `practitioner`, recepção = `reception`, revenda/plataforma = `platform`.

## Regras
- Multi-tenant sempre: toda tabela de negócio tem `tenant_id`; toda query filtra por tenant (RLS no Postgres).
- O role do Postgres da aplicação **nunca** é superusuário: superusuário ignora RLS em silêncio e o
  isolamento entre clínicas desaparece sem erro nenhum.
- Nunca hard-code cor/fonte: use os tokens do Classical (`styles.css`). Acento vem do tenant.
- Permissões checadas no servidor, não só escondendo menu.
- Prontuário, anamnese e fotos: acesso grava `audit_log`; fotos em bucket privado com URL assinada.
- Fórmulas de preço exatamente como em README → "Regras de negócio"; cobrir com testes unitários usando os valores da planilha (ex. Restylane Kysse/Tatuapé → à vista R$ 1.142,02, parcelado R$ 1.386,73).
- Mobile-first nos fluxos de atendimento (agenda do dia, ficha, fotos); alvos ≥ 44px.
- `data/` fica **fora do git**: contém a planilha real da clínica (custos, margens). O repo é público.

## Testes
- **Unitários (Vitest)** para regra de negócio pura: fórmulas de preço, matriz de permissões,
  contraste de cor, TOTP, formatação pt-BR. Ficam ao lado do código (`*.test.ts`).
- **Integração (Vitest)** para o que só o banco prova: isolamento por RLS e ciclo de vida de sessão.
  Ficam em `tests/`, e rodam contra um Postgres real com role sem superusuário.
- **End-to-end (Playwright)** para os fluxos que a usuária percorre: login, 2FA, navegação filtrada
  por perfil, acesso negado, troca de clínica por hostname. Ficam em `e2e/`.
- Toda funcionalidade nova entra com teste. Bug corrigido entra com teste de regressão.

## Execução local
- **Docker para tudo**: `docker compose up` sobe banco e aplicação. Sem depender do que está
  instalado na máquina. `npm run dev` continua existindo para o ciclo rápido de desenvolvimento.
- Portas: aplicação **3100**, Postgres **5434** (as padrão estão ocupadas nesta máquina).

## Documentação de uso
- `docs/FAQ.md` documenta **como usar** cada funcionalidade, em português, na linguagem de quem
  opera a clínica — não em termos técnicos. Funcionalidade nova só está pronta quando entra no FAQ.
- `docs/operacao.md` é o runbook de produção (criar clínica, redefinir senha, auditoria).

## Ordem de implementação
1. Scaffold, tokens, auth + perfis + tenant por hostname
2. Cadastros: parâmetros, materiais, salas (seed da planilha), pacientes
3. Agenda (dia/semana/lista)
4. Ficha de atendimento + estoque (baixa por lote) + fechamento financeiro
5. Termos com assinatura e PDF
6. Financeiro, relatórios
7. WhatsApp e portal da paciente
8. Painel da revenda (tenants, flags, "entrar como")

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
