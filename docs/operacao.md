# Operação — Prumo em produção (homelab)

Runbook do dia a dia. Para uso do sistema, ver [`FAQ.md`](FAQ.md); para o escopo,
[`especificacao.md`](especificacao.md).

O deploy vive no repo `homelab`: manifests em `helm/apps/prumo/`, Application do Argo em
`helm/argocd/application-prumo.yml`, database em `helm/postgres/app-db-prumo.yml`, e a decisão
de infra registrada em `docs/adr/0010-prumo-no-homelab.md`. **Os pré-requisitos out-of-git
(secrets, imagem, CNAME) estão listados na ADR** — este documento cobre o dia a dia depois disso.

## Como um deploy acontece

```
git push em main (repo prumo)
  → workflow build-image.yml
      job build-push:       publica ghcr.io/thiagotn/prumo:sha-<sha>
      job bump-homelab-tag: escreve o newTag em helm/apps/prumo/kustomization.yaml (repo homelab)
  → Argo CD detecta o commit e faz o rollout
      initContainer migrate: prisma migrate deploy
      container web:         node server.js
```

Conferir: `kubectl -n argocd get app prumo` → quer `Synced` / `Healthy`.

⚠️ Com `selfHeal` ligado, `kubectl set image` à mão é revertido. Rollback de verdade = apontar o
`newTag` para um sha anterior no `kustomization.yaml` e dar `git push`.

## Criar uma clínica nova (tenant)

Três coisas, nesta ordem — só a terceira é deploy:

1. **Regra no túnel** (repo homelab, `helm/cloudflared/configmap.yml`): copie o bloco de
   `app.dratatimayumi.com.br` trocando o hostname. Depois, na máquina com acesso:

   ```bash
   cloudflared tunnel route dns --overwrite-dns <tunnel-id> app.<dominio-da-clinica>
   # ⚠️ obrigatório: o cloudflared lê a config no boot e NÃO recarrega o ConfigMap.
   # Sem este restart o hostname novo cai no catch-all e responde 404 vazio.
   kubectl -n cloudflared rollout restart deploy/cloudflared
   ```
2. **Host no Ingress** (`helm/apps/prumo/ingress.yml`): mais um item em `tls.hosts` e mais uma
   `rule` igual à existente.
3. **A clínica no banco.** Há dois caminhos; os dois fazem a mesma coisa.

   **a) No node, com `scripts/onboard-clinic.sh`** — faz os passos 1 e 3 de uma vez (cria o
   CNAME e cadastra a clínica), é idempotente e não precisa de Node.js nem do CLI do
   cloudflared. Copie o script para o node e rode lá:

   ```bash
   scp scripts/onboard-clinic.sh <node>:~/
   ssh <node> './onboard-clinic.sh \
     --host app.clinicaaurora.com.br \
     --name "Clínica Aurora" \
     --subtitle "Harmonização Facial · Moema, SP" \
     --monogram CA \
     --color "#7d5411" \
     --unit "Unidade Moema" \
     --plan ESSENTIAL \
     --owner-name "Dra. Helena Prado" \
     --owner-email helena@clinicaaurora.com.br'
   ```

   Ele lê o id do túnel e o token da Cloudflare do próprio cluster, valida o contraste da cor
   com a mesma regra da aplicação e imprime a senha inicial uma vez. Tem `--dry-run` e
   `--only-dns`. O passo 1 (DNS) ele cobre; a regra no túnel e o host no Ingress continuam
   sendo commit no repo homelab, feitos antes.

   **b) Da sua máquina, com `scripts/create-tenant.ts`** — quando você quiser o caminho que
   passa pelas validações da aplicação em TypeScript. Precisa do banco alcançável; use
   `scripts/tunnel-prod-db.sh` (a imagem de produção não traz `tsx`, que é devDependency).

```bash
# terminal 1 — abre o túnel (o Service do Postgres é headless, então não dá para usar
# `kubectl port-forward` de fora; o script encaminha via SSH pelo node)
PRUMO_NODE=<user@node> ./scripts/tunnel-prod-db.sh

# terminal 2 — lê a senha do secret do cluster, sem passar pelo histórico do shell
export DATABASE_URL="$(ssh <user@node> \
  "kubectl -n prumo get secret prumo-db -o jsonpath='{.data.DATABASE_URL}' | base64 -d" \
  | sed 's|@postgres.postgres.svc.cluster.local:5432|@localhost:5435|')"
npx tsx scripts/create-tenant.ts \
  --name "Clínica Aurora" \
  --subtitle "Harmonização Facial · Moema, SP" \
  --monogram CA \
  --color "#7d5411" \
  --domain clinicaaurora.com.br \
  --host app.clinicaaurora.com.br \
  --unit "Unidade Moema" \
  --plan ESSENTIAL \
  --owner-name "Dra. Helena Prado" \
  --owner-email helena@clinicaaurora.com.br
```

> A senha do `prumo-db`:
> `kubectl -n prumo get secret prumo-db -o jsonpath='{.data.DATABASE_URL}' | base64 -d`

O script recusa cor de acento com contraste abaixo de 3:1 contra o fundo `#f3f2f2` — a mesma
validação da tela de Configurações. A senha inicial é impressa uma vez e não fica gravada em
lugar nenhum além do hash; entregue por canal seguro. O 2FA é cadastrado pela própria pessoa no
primeiro login (QR na tela).

## Dar carga inicial a uma clínica a partir de outra

Uma clínica recém-criada nasce vazia: sem parâmetros de preço não existe orçamento, e sem sala,
procedimento e produto não é possível fechar um atendimento. Quando outra clínica já tem esses
números, `copy-clinic-setup.ts` copia em vez de você redigitar — útil para montar uma clínica de
homologação espelhando a produção.

```bash
npx tsx --tsconfig tsconfig.scripts.json scripts/copy-clinic-setup.ts \
  --from <host-de-origem> --to <host-de-destino> [--catalog] [--dry-run]
```

Sem `--catalog` copia só os parâmetros de preço. Com `--catalog`, também salas, procedimentos e
produtos. Sempre rode antes com `--dry-run`, que imprime o que faria sem gravar nada.

O que **não** é copiado, de propósito:

- **pacientes, agendamentos, atendimentos e pagamentos** — são registros da clínica, e copiar
  uma paciente de uma clínica para outra é exatamente o que todo o isolamento existe para impedir;
- **lotes de estoque** — um lote é uma caixa física numa prateleira, com número de lote e
  validade. Copiar inventaria estoque que não existe. Na clínica de destino, cadastre os lotes
  pela tela de Estoque; no caminho você valida esse fluxo também.

Rodar de novo é seguro: salas, procedimentos e produtos são casados por nome (e marca) e
atualizados; os parâmetros de preço só ganham versão nova se os números diferirem dos que a
clínica de destino já lê.

Atenção ao que o catálogo carrega: **custo de compra, rendimento e margem** da clínica de
origem. São os números comerciais dela. Só use `--catalog` entre clínicas do mesmo dono, e
lembre que a de destino passa a ter essa informação para quem tiver acesso de administrador lá.

## Redefinir senha / trocar de celular

Da sua máquina, com o túnel aberto (`scripts/tunnel-prod-db.sh`) e o `DATABASE_URL` montado a
partir do secret, como no bloco acima.

```bash
npx tsx scripts/reset-password.ts --host <app.dominio-da-clinica> --email <e-mail-da-pessoa>
npx tsx scripts/reset-password.ts --host ... --email ... --reenrol-2fa
```

Redefinir senha **encerra todas as sessões abertas** da pessoa. `--reenrol-2fa` apaga o
segredo TOTP — é o que fazer quando ela perde ou troca o celular.

## Encerrar todas as sessões de todo mundo

Trocar o `SESSION_SECRET` invalida **todos** os cookies de sessão de uma vez, porque o hash
gravado em `sessions.token_hash` deixa de bater. É o botão de pânico:

```bash
kubectl -n prumo delete secret prumo-app
kubectl -n prumo create secret generic prumo-app --from-literal=SESSION_SECRET="$(openssl rand -hex 32)"
kubectl -n prumo rollout restart deploy/prumo
```

## Ler a trilha de auditoria

`audit_log` é append-only no banco: há policy de RLS para SELECT e INSERT, e **nenhuma** para
UPDATE ou DELETE — nem a aplicação nem o dono da tabela alteram o que já foi gravado. A consulta
precisa de escopo (senão a RLS não devolve nada):

```sql
-- por clínica
BEGIN;
  SELECT set_config('app.tenant_id', '<tenant-id>', true);
  SELECT created_at, action, resource, resource_id, ip, user_id
    FROM audit_log ORDER BY created_at DESC LIMIT 50;
COMMIT;

-- atravessando clínicas (escopo de plataforma)
BEGIN;
  SELECT set_config('app.platform_scope', 'on', true);
  SELECT tenant_id, action, count(*) FROM audit_log GROUP BY 1, 2 ORDER BY 3 DESC;
COMMIT;
```

Uma query sem nenhum dos dois `set_config` devolve **zero linhas**. Isso é o desenho, não um erro:
o padrão é negar. Vale para toda tabela de negócio.

## Painel da revenda e "entrar como"

O painel vive nos hostnames listados em `PLATFORM_HOSTS` (separados por vírgula). Um host dessa
lista **não serve clínica nenhuma**: resolve para o painel de tenants e recusa login de usuário de
clínica. Com a variável vazia o painel deixa de existir — e **em produção ela está vazia hoje**
(`helm/apps/prumo/configmap.yml` no repo `homelab`), porque o domínio do produto de revenda ainda
não foi decidido. Enquanto estiver assim, o super-admin não tem por onde entrar, que é o estado
mais seguro para um deployment de clínica única.

Para ligar o painel, na ordem:

1. escolher o domínio (o nome "Ateliê" é placeholder na especificação) e apontar o CNAME no
   Cloudflare Tunnel;
2. acrescentar o host ao `ingress.yml` do repo `homelab`;
3. preencher `PLATFORM_HOSTS` no `configmap.yml` com esse host e reiniciar o Deployment;
4. criar o super-admin: um `users` com `tenant_id IS NULL`, `role = 'SUPERADMIN'` e 2FA — o mesmo
   caminho de "Criar uma clínica nova", sem tenant.

2FA é obrigatório para ele, como para qualquer perfil com acesso a prontuário.

**Plano, cobrança, mensalidade e flags** por clínica saem de `/tenants/<id>`. Desativar uma clínica
grava `deactivated_at` — é o que faz o churn do mês ser calculável; o CHECK
`tenants_inactive_has_a_date` impede desativar sem data. Mensalidade em branco significa "ainda não
combinada", e o painel conta quantas estão assim em vez de fingir que valem zero.

**"Entrar como"** abre a instância da clínica com uma sessão de suporte:

1. a sessão é criada do lado da plataforma, já com 2FA satisfeito e `impersonated_by_user_id`;
2. o que viaja para o host da clínica é um bilhete em `impersonation_handoffs` — 256 bits, só o
   HMAC guardado, **um minuto** de vida, **uso único** e emitido para um host específico;
3. `/enter/<bilhete>` gasta o bilhete, **gira o token da sessão** e devolve o novo no cookie. A URL
   que ficou no histórico do navegador já não abre nada.

Enquanto a sessão está assumida: faixa no topo de todas as telas, prontuário/anamnese/fotos
mascarados, upload de foto recusado, e `tenant.impersonate` no `audit_log` da plataforma **e** da
clínica. A clínica corta o acesso no botão **Encerrar** da própria faixa.

**Desmascarar o prontuário exige autorização da clínica, e não tem tela** — de propósito: é uma
decisão que deve custar. Com a autorização registrada por escrito:

```sql
BEGIN;
  SELECT set_config('app.platform_scope', 'on', true);
  UPDATE sessions SET medical_record_unlocked = true
   WHERE id = '<session-id>' AND impersonated_by_user_id IS NOT NULL;
COMMIT;
```

Vale só para aquela sessão (uma hora, no máximo). Guarde a autorização junto do `id` usado: o
`audit_log` registra `medicalRecordUnlocked` em cada leitura de prontuário, e é esse par que
explica o acesso depois.

Bilhetes vencidos não precisam de faxina para funcionar — são recusados pela data — mas a tabela
cresce. Se incomodar:

```sql
-- sem set_config: esta tabela fica fora do RLS de propósito (ver a migração).
DELETE FROM impersonation_handoffs WHERE expires_at < now() - interval '7 days';
```

## Excluir uma clínica

`DELETE` em `tenants` leva embora usuários, sessões e domínios (CASCADE), mas **preserva o
`audit_log`** — a FK é `SET NULL`, para que a prova de quem acessou prontuário sobreviva ao
desligamento da clínica. Os registros ficam legíveis só em escopo de plataforma. Exporte a trilha
antes, se a clínica precisar dela.

---

## Fotos clínicas (R2)

As fotos ficam num bucket privado do Cloudflare R2 — sem domínio próprio, sem `r2.dev`, sem proxy
público. O único jeito de ler um objeto é uma URL assinada que o servidor emite depois de autorizar.
O racional completo está na **ADR 0011** do repo `homelab`.

### As cinco variáveis

| Variável | Onde | Valor |
|---|---|---|
| `R2_ACCOUNT_ID` | secret `prumo-r2` | conta da Cloudflare |
| `R2_ACCESS_KEY_ID` | secret `prumo-r2` | token escopado ao bucket |
| `R2_SECRET_ACCESS_KEY` | secret `prumo-r2` | idem |
| `R2_BUCKET` | ConfigMap | `prumo-clinical` |
| `R2_SIGNED_URL_TTL` | ConfigMap | `120` (segundos, leitura) |

Sem elas o app sobe normalmente — a seção de fotos diz que o armazenamento não está configurado.
É o que permite rodar dev e CI sem bucket.

```bash
kubectl -n prumo exec deploy/prumo -- printenv | grep -c '^R2_'   # espera 5
```

### Como um upload acontece

1. O navegador converte a foto para WebP e pede `POST /api/photos/sign-upload`.
2. O servidor confere sessão, 2FA, perfil, flag da clínica e se o atendimento é do tenant; cria a
   linha em `PENDING` e devolve um PUT assinado de 5 minutos.
3. O navegador envia **direto para o R2** — o byte não passa pelo pod nem pelo túnel.
4. `POST /api/photos/{id}/confirm` faz `HeadObject`, confere tipo e tamanho, e marca `READY`.

Um upload que não chega nunca vira `READY`, e o objeto de tipo errado é apagado na confirmação.

### Como uma leitura acontece

`GET /api/photos/{id}/raw` → autoriza → grava `audit_log` → **302** para um GET assinado de 120s,
com `Cache-Control: private, no-store`.

A URL assinada nunca aparece no HTML. Num `src` de `<img>` ela vazaria no histórico do navegador e
expiraria na cara da usuária; o redirect resolve os dois e dá o único ponto onde toda leitura é
registrada.

### Apagar uma paciente (LGPD)

As linhas cascateiam; **os objetos no bucket não**. Use o script, que varre o prefixo da paciente:

```bash
PRUMO_NODE=<user@node> ./scripts/tunnel-prod-db.sh        # terminal 1
export DATABASE_URL="$(ssh <user@node> \
  "kubectl -n prumo get secret prumo-db -o jsonpath='{.data.DATABASE_URL}' | base64 -d" \
  | sed 's|@postgres.postgres.svc.cluster.local:5432|@localhost:5435|')"
export R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=prumo-clinical

npx tsx --tsconfig tsconfig.scripts.json scripts/erase-patient.ts \
  --host app.dratatimayumi.com.br --patient <uuid> --dry-run
```

Sem `--dry-run` ele pede o nome da paciente por extenso antes de apagar. Os objetos saem **antes**
das linhas: se a varredura falhasse depois, as chaves já teriam sumido do banco e os objetos
ficariam órfãos, sem nada apontando para eles. Ele varre o **prefixo**, não as chaves do banco,
então pega também upload assinado que nunca foi confirmado.

No fim ele relista o prefixo e falha se sobrou alguma coisa.

### Backup dos objetos — decisão pendente

O `pg_dumpall` diário cobre as **linhas**, não os objetos. Hoje o R2 é **cópia única**: ele replica
internamente, mas isso protege contra falha de disco, **não** contra exclusão acidental ou token
comprometido.

Recomendação: um `rclone sync` diário do bucket para um segundo destino (outro bucket, outra conta),
como CronJob no cluster — mesmo padrão do `pg_dumpall`. Enquanto isso não existir, uma exclusão
errada de foto é irreversível. É trabalho do lado do `homelab` e está registrado na ADR 0011.

### Política de privacidade

A Cloudflare passa a ser **subprocessadora de dado de saúde**. A política de privacidade da clínica
precisa dizer isso antes de a primeira foto real ser enviada.

---

## Backup

O `pg_dumpall` diário do Postgres compartilhado (`helm/postgres/backup-cronjob.yml`) já cobre o
database `prumo`. **Atenção**: esse dump passa a conter dados sensíveis de saúde. Antes de a
clínica entrar em produção de verdade, revise onde o dump é guardado — hoje é `local-path` no
próprio nó, sem cifragem em repouso.
