# Especificação do produto

Material de handoff do protótipo, reorganizado. Descreve **o que** o sistema é: telas, perfis,
white-label e modelo de dados. O **como** (stack, comandos) está no [README](../README.md); a
aparência está em [design.md](design.md); as fórmulas de preço em
[regras-de-negocio.md](regras-de-negocio.md).

Esta é a fonte da verdade do escopo. Quando o código divergir daqui, um dos dois está errado —
`src/lib/rbac.test.ts`, por exemplo, falha se a matriz de permissões do código não corresponder à
tabela deste documento.

---

## Visão geral

Sistema web responsivo e multi-tenant para clínicas de estética injetável. Primeira cliente:
Dra. Tati Mayumi (Tatuapé, SP). O mesmo código serve outras clínicas (revenda white-label): cada
tenant tem marca, domínio, módulos e usuários próprios.

Módulos: login com perfis, painel, agenda, pacientes, ficha de atendimento
(anamnese → procedimento → fotos → fechamento → termo), financeiro/caixa, estoque de insumos,
relatórios, lembretes WhatsApp, termos de consentimento, configurações da instância, painel da
revenda (tenants), portal da paciente.

---

## Multi-tenant / white-label

Tabela `tenants`: `id, name, subtitle, monogram, logo_url, accent_color (hex), domain, plan,
enabled_modules (jsonb), billing_status`.

- A cor de acento substitui `--color-accent` e `--brand` em runtime (CSS var no `<html>`).
  Validar contraste ≥ 3:1 contra `#f3f2f2` ao salvar — implementado em `src/lib/color.ts`.
- **Feature flags por tenant** (tela Configurações): portal da paciente, fotos clínicas,
  precificação automática, baixa automática de estoque, múltiplos profissionais/comissão,
  múltiplas unidades.
- **Resolução por hostname**: `app.<dominio-da-clinica>`. Os hostnames que respondem por um tenant
  ficam em `tenant_domains`, então abrir uma clínica nova é configuração, não deploy. Hostname
  desconhecido dá 404 — não existe instância genérica.
- **Super-admin da revenda** vê a lista de tenants, MRR e uso. "Entrar como" abre a instância com
  faixa de sessão assumida, registrado em log, e **prontuário mascarado** salvo autorização.
- Nome do produto da revenda ainda indefinido (placeholder "Ateliê").

---

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

Mais: **Super-admin revenda** (tenants, config, painel) e **Paciente** (só portal).

- Menu lateral e tab bar mobile filtram itens pelo perfil — mas **esconder menu não é permissão**:
  quem nega é o guard de servidor (`src/lib/auth/guards.ts`).
- **2FA obrigatório** para perfis com acesso a prontuário.
- Todo acesso a prontuário ou foto grava em `audit_log` (LGPD — dados sensíveis de saúde).
- Trocar de perfil re-filtra a navegação e redireciona se a tela atual não for permitida.

A matriz vive em `src/lib/rbac.ts`. A tabela acima está transcrita em `src/lib/rbac.test.ts`.

---

## Telas

Desktop: canvas 1280 × 800. Mobile: 390 × 812. Layout do app = nav (sidebar 218px OU topbar) +
área de conteúdo (header com padding 18/28px + scroll com padding 26/28/40px).

1. **Login** — split 1.05fr/.95fr. Esquerda com fundo `--color-neutral-900`, monograma em círculo
   com borda de acento, kicker "Acesso restrito", H1 Cormorant 300 54px. Direita: e-mail, senha,
   "manter conectado", "Esqueci a senha", botão Entrar, botão "Entrar com verificação em 2 etapas".
   Mobile: centralizado, + "Entrar com biometria".
2. **Painel** — faixa de 4 KPIs (atendimentos no mês, faturamento, lucro líquido, lucro por hora)
   com divisórias hairline; lista "Próximos atendimentos de hoje"; card "Lucro por hora" (barras por
   procedimento); card de pendências (estoque zerado, termos sem assinatura, validade).
3. **Agenda** — três visões: **Dia** (grade de horas 74px/slot, bloco com borda-esquerda 3px de
   acento, slots livres tracejados, bloqueio listrado, coluna lateral com resumo do dia e ações),
   **Semana** (6 colunas Seg–Sáb, hoje destacado), **Lista** (tabela com data, hora, paciente,
   procedimento, sala, status, valor, pagamento). Filtro por sala. Status: Confirmado (tag-accent),
   Aguardando (tag-outline), Atendido (tag-neutral). Mobile: seletor de dias + cards com "WhatsApp"
   e "Atender".
4. **Pacientes** — filtros (todas/ativas/retorno vencido/sem termo), tabela (nome+tags, nascimento,
   telefone, último, próximo, LTV) + painel lateral da paciente (dados, alerta clínico, termo
   vigente, antes & depois).
5. **Ficha de atendimento** — variação **Etapas** (stepper de 5 passos; mobile com barra de
   progresso e botão "Próxima: X") ou **Tela única** (seções empilhadas). Seções: Anamnese;
   Procedimento (procedimento, produto/marca, lote, validade, volume, técnica, evolução; baixa
   automática no estoque); Fotos (4 enquadramentos padronizados, guia fantasma da foto anterior);
   Fechamento (forma de pagamento, decomposição de custos, lucro e margem); Termo (assinatura em
   tela ou por link, PDF com hash/IP/horário). Lateral: preço sugerido à vista/parcelado + linha do
   tempo.
6. **Financeiro** — 5 KPIs; tabela de lançamentos com cobrado, custos, imposto+taxa, lucro, margem
   (margem < 28% em `--color-accent-700`); card de parâmetros; card de reservas (10% recompra,
   5% emergência, restante retirada).
7. **Estoque** — tabela: produto, procedimento, unidade, custo, rendimento, custo/atendimento,
   quantidade, lote/validade, status (OK/Baixo/Vence/Repor). Botão "Entrada de nota".
8. **Relatórios** — gráfico de barras de 6 meses (faturamento em contorno, lucro preenchido), mix
   por linha de procedimento, guia de margem (faixas da aba "Orientação" da planilha). Exportar
   CSV / PDF para o contador.
9. **Mensagens** — automações (24h antes, 48h preparo, pós 1 dia, retorno 14 dias, política de
   falta, aniversário) com status e métricas; pré-visualização no formato WhatsApp. Resposta "1"
   confirma, "2" devolve à lista de espera.
10. **Termos** — modelos versionados (versão nova nunca sobrescreve; o PDF guarda a versão
    assinada) + pendências com "Reenviar link".
11. **Configurações** — identidade (nome, subtítulo, domínio, remetente, cor, logo) com prévia ao
    vivo do login; operação (expediente, duração padrão, antecedência, política de falta); feature
    flags; matriz de permissões.
12. **Tenants (revenda)** — KPIs (clínicas ativas, MRR, atendimentos, churn) + tabela de clínicas
    (plano, usuários, módulos, cobrança, "Entrar como").
13. **Portal da paciente** — próximo horário com Confirmar/Reagendar, orientações pré, documentos
    (termos, recibos).

**Mobile**: header com monograma + título + avatar; tab bar inferior (Painel, Agenda, Atender,
Pacientes, Caixa — filtrada por perfil), alvos ≥ 44px. Módulos gerenciais (financeiro, estoque,
relatórios…) abrem em modo de leitura resumido.

---

## Interações

- Clicar num horário da agenda ou numa paciente abre a ficha de atendimento.
- Salvar o fechamento: baixa o estoque do lote, gera lançamento financeiro e agenda as automações
  de pós-procedimento e de retorno.
- Troca de perfil re-filtra a navegação e redireciona se a tela atual não for permitida.
- Sem animações relevantes; hover, pressed e focus vêm das classes do design system.

---

## Modelo de dados (mínimo)

`tenants`, `users` (tenant_id, role, 2fa), `units`/`rooms` (valor-hora), `patients`, `anamneses`
(versionada), `appointments` (patient, room, procedure, product, start, end, status), `procedures`,
`products` (custo, rendimento, unidade), `stock_lots` (produto, lote, validade, qtd),
`stock_movements`, `encounters` (appointment, product_lot, volume, técnica, evolução), `photos`
(encounter, enquadramento, storage_key), `payments` (forma, valor, taxa aplicada), `pricing_params`
(por tenant, com histórico), `consent_templates` (versão), `consent_signatures` (hash, ip,
timestamp, pdf_key), `message_automations`, `message_queue`, `audit_log`.

Toda tabela de negócio carrega `tenant_id` e é protegida por Row Level Security. O que já existe
está em `prisma/schema.prisma`; o resto entra nas etapas 2–8.
