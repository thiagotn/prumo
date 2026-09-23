# FAQ — como usar o sistema

Perguntas na linguagem de quem opera a clínica. Se algo aqui não corresponde ao que você vê na
tela, o sistema está errado, não o texto — avise.

> **Onde estamos:** etapas 1, 2 e 3 prontas — entrar no sistema, perfis de acesso, uma instância por
> clínica, cadastro de pacientes, configurações da clínica e a **agenda** (dia, semana e lista). As
> telas de ficha de atendimento, financeiro, estoque, relatórios, mensagens e termos ainda estão
> sendo construídas — ao abrir, cada uma informa em qual etapa entra. As
> perguntas sobre essas telas estão marcadas com **(em breve)**.

---

## Entrar no sistema

### Qual endereço eu uso?

O endereço da sua clínica: `app.` + o domínio dela. Para a Dra. Tati Mayumi,
`https://app.dratatimayumi.com.br`. Cada clínica tem o seu, com a sua marca e a sua cor.

Se digitar um endereço que não é de nenhuma clínica, a tela diz "Não há nada neste endereço" — não
é erro seu, é o sistema não confirmando quais clínicas existem para quem fica testando endereços.

### Quem cria meu acesso?

Quem administra a clínica. Não existe "criar conta" — cada acesso é individual e cadastrado por
dentro. Você recebe o e-mail cadastrado e uma senha inicial, por um canal seguro.

### O que é aquele código de 6 dígitos que ele pede?

É a verificação em duas etapas (2FA). Quem enxerga prontuário, anamnese ou fotos clínicas é obrigado
a usar: além da senha, o sistema pede um código que muda a cada 30 segundos, gerado por um app no
seu celular.

No primeiro acesso a tela mostra um QR code:

1. instale um app autenticador (Google Authenticator, Authy ou 1Password);
2. aponte a câmera para o QR code — ou digite a chave que aparece embaixo dele;
3. digite os 6 dígitos que o app mostrar.

A partir daí, todo login pede a senha e o código.

### Por que a recepção não precisa do código e eu preciso?

Porque a recepção não vê prontuário nem foto clínica. A exigência acompanha o que o perfil alcança,
não o cargo.

### "Código incorreto" e eu digitei o que está na tela

Quase sempre é o relógio do celular fora de hora. O código é calculado a partir da hora; se o
celular está adiantado ou atrasado, ele não bate. Deixe a data e hora do celular no modo automático
e tente de novo. O sistema tolera até 30 segundos de diferença.

### Troquei de celular e perdi o app autenticador

Peça para quem administra a clínica zerar seu segundo fator. No próximo login você cadastra o app
de novo, com um QR code novo.

### Esqueci a senha

Por enquanto, quem administra a clínica redefine para você — e isso encerra todas as suas sessões
abertas, de propósito. A redefinição por e-mail entra junto com os e-mails automáticos (etapa 6).

### "Muitas tentativas. Aguarde 15 minutos"

Cinco senhas erradas seguidas para o mesmo e-mail travam novas tentativas por 15 minutos. É proteção
contra quem fica tentando adivinhar senha. Espere os 15 minutos ou peça a redefinição.

### Marquei "manter conectado" — quanto tempo dura?

Trinta dias. Sem marcar, a sessão vale 12 horas e cai ao fechar o navegador — que é o certo em
computador compartilhado, como o da recepção.

### Como saio com segurança?

O botão **Sair**, no rodapé do menu (no celular, pelo menu). Ele encerra a sessão no servidor, não
só no navegador: mesmo que alguém aperte "voltar", não entra.

---

## O que cada perfil vê

### Por que não tenho o menu que minha colega tem?

O menu mostra só o que o seu perfil alcança:

| Perfil | Alcança |
|---|---|
| **Doutora (owner)** | tudo da clínica: agenda, pacientes, prontuário, fotos, financeiro, estoque, relatórios, termos e configurações |
| **Recepção** | agenda, pacientes (sem prontuário), mensagens, termos e lançamento no caixa |
| **Financeiro** | financeiro, estoque e relatórios — nenhum dado clínico |
| **Profissional convidado** | agenda, pacientes e fichas **dos próprios pacientes**, e termos |
| **Paciente** | só o portal dela |

### Digitei o endereço de uma tela que não está no meu menu

O sistema devolve você para a sua tela inicial com um aviso. Esconder o item do menu não é a
proteção — o servidor confere a permissão a cada acesso. E a tentativa fica registrada.

### O que significa "acesso parcial"?

Você abre a tela, mas não vê tudo. A recepção, por exemplo, lança um pagamento no caixa mas não vê
custo nem margem.

### Sou profissional convidado e não acho uma paciente

Você vê apenas as suas. As pacientes de outro profissional não aparecem na sua busca.

---

## Privacidade e registro de acesso

### Quem sabe que eu abri um prontuário?

Fica registrado: quem, quando, de qual endereço de rede e qual prontuário. Também é registrado
acesso a anamnese e a foto clínica, cada tentativa de entrar em tela sem permissão, e todo login —
bem ou malsucedido.

Isso é exigência da LGPD para dado de saúde, e existe para proteger a paciente e você. O registro
não pode ser alterado nem apagado pelo sistema, por ninguém.

### O sistema aparece no Google?

Não. Todas as páginas pedem para não serem indexadas, e o conteúdo só existe depois do login.

### Duas clínicas no mesmo sistema veem os dados uma da outra?

Não. A separação é feita pelo banco de dados, não só pela tela: uma consulta feita no endereço de
uma clínica não alcança dado de outra, mesmo que o programa peça. Seu login também não funciona no
endereço de outra clínica.

### Alguém do suporte pode entrar na minha instância?

Pode, quando a revenda precisa dar suporte — e aí aparece uma faixa no topo avisando que a sessão
foi assumida. Nessa situação o prontuário aparece **mascarado**, a não ser que você autorize. Tudo
fica em registro. (O painel da revenda entra na etapa 8.)

---

## A identidade da clínica

### De onde vem a cor do sistema?

Da configuração da clínica. Ela substitui o dourado padrão em botões, bordas e destaques.

### Escolhi uma cor e o sistema recusou

A cor precisa ter contraste suficiente contra o fundo claro — no mínimo 3:1 — senão a borda dos
botões desaparece no papel e quem tem baixa visão não consegue usar. Tons muito claros são
recusados com a explicação. Escolha um tom mais escuro da mesma cor.

### Abrir uma clínica nova exige instalar outro sistema?

Não. É o mesmo sistema: cadastra-se a clínica, o endereço dela passa a responder com a marca e a
cor próprias, e pronto.

---

## No celular

### Dá para atender pelo celular?

Os fluxos de atendimento são feitos pensando no celular primeiro: agenda do dia, ficha e fotos. A
barra inferior leva aos destinos do atendimento, com botões grandes o suficiente para o dedo.

### E o financeiro no celular?

Módulos gerenciais (financeiro, estoque, relatórios) abrem em leitura resumida — o suficiente para
consultar fora da clínica. A edição fica no computador.

---

## Pacientes

### Como encontro uma paciente?

Em **Pacientes**. A lista vem em ordem alfabética e a busca aceita nome, telefone ou e-mail — digite
e clique em Buscar. Os filtros no topo mostram todas, só as ativas, ou só as que têm alerta clínico.

### O que é o "alerta clínico"?

A linha que não pode passar batido antes de um procedimento: uma alergia, um anticoagulante em uso,
uma reação anterior. Ela aparece destacada no painel lateral e como etiqueta na lista. **Não é o
prontuário** — é o aviso curto que precisa saltar aos olhos.

### Onde está o prontuário da paciente?

Entra na etapa 4, junto com a ficha de atendimento. Quando entrar, abrir prontuário, anamnese ou
fotos vai exigir 2FA e ficar registrado no log de auditoria.

### Sou profissional convidado e não vejo todas as pacientes

Você vê as suas. É o perfil funcionando como previsto.

---

## Configurações da clínica

Só a doutora (perfil owner) abre esta tela.

### Mudei a cor e ela avisou que o contraste é baixo

A cor de acento precisa de contraste de pelo menos 3:1 contra o fundo claro do sistema. Abaixo
disso, o contorno dos botões desaparece no papel e quem tem baixa visão não consegue usar. A tela
mostra o contraste enquanto você digita e bloqueia o salvamento até ficar dentro — escolha um tom
mais escuro da mesma cor.

### O que é a prévia do login?

O quadro que mostra como a tela de entrada vai ficar com o nome, o monograma e a cor que você está
escolhendo. Ele muda enquanto você digita, antes de salvar.

### O que significa "a margem é líquida"?

Que a margem definida nos parâmetros é o que **sobra de verdade** no caixa. Os dois preços — à vista
e parcelado — já embutem os impostos e a taxa correspondente da maquininha. Quem parcela paga a
diferença da taxa, não a clínica.

Em Pix e dinheiro não há maquininha, então a margem sai ainda maior que a definida.

### O que é o "rateio por atendimento"?

Seus custos fixos do mês divididos pelos atendimentos previstos. É quanto cada atendimento precisa
cobrir de despesa que existe mesmo com a agenda vazia. A tela recalcula na hora quando você muda
qualquer um dos dois números.

Mexer nele muda **todos** os preços sugeridos — é o número com mais efeito na tabela.

### Salvei os parâmetros. E os preços antigos?

Cada salvamento cria uma versão nova; a anterior fica guardada. Um atendimento cobrado mês passado
continua explicável com os parâmetros daquele mês.

### "Impostos, taxa e margem somam mais de 100%"

Não existe preço que feche essa margem: se os três já consomem o preço inteiro, não sobra nada para
pagar o custo. A tela bloqueia antes de salvar. Reduza a margem ou confira se alguma taxa foi
digitada errada.

### Desliguei um módulo sem querer

Religue na mesma tela, em **Módulos**. Nada é apagado — o módulo some do menu de todo mundo enquanto
está desligado e volta com os dados intactos.

### Posso mudar quem enxerga o quê?

A matriz de permissões é fixa no sistema e aparece em Configurações só para consulta. Ela é conferida
no servidor a cada acesso — não é questão de esconder item de menu.

---

## Agenda

### Como vejo o dia de hoje?

Em **Agenda**. Ela abre no dia de hoje, na visão **Dia**: uma faixa por hora, das 8h às 19h. As
setas andam um dia para trás ou para frente, e o botão **Hoje** aparece assim que você se afasta.

### Para que servem as três visões?

- **Dia** — a grade hora a hora, para trabalhar o dia corrente.
- **Semana** — segunda a sábado lado a lado, com hoje destacado, para enxergar a carga da semana.
- **Lista** — os próximos 14 dias em tabela, com data, hora, paciente, procedimento, sala e status.

### O que é um "Bloqueio"?

Uma faixa listrada sem paciente: almoço, deslocamento, ou uma sala que não foi contratada naquela
hora. É a agenda dizendo "indisponível", e não "vago".

### O que significam as cores dos status?

**Confirmado** (destaque), **Aguardando** (contorno) e **Atendido** (neutro). Faltou e Cancelado
aparecem também, quando for o caso.

### Filtrei por sala e sumiu tudo

O filtro mostra só o que está marcado naquela sala. Volte em **Todas as salas** para ver a agenda
inteira.

### Cliquei numa paciente e não abriu a ficha

A ficha de atendimento entra na etapa 4. Até lá, o clique leva para a tela que avisa isso.

### Sou profissional convidado e vejo pouca coisa

Você vê a sua agenda. Os horários de outro profissional não aparecem para você.

### No celular

A tira de dias no topo troca o dia com um toque, e cada atendimento vira um card. Os alvos são
grandes o suficiente para o dedo.

---

## Telas em construção

### Ficha de atendimento **(em breve, etapa 4)**
Cinco passos: anamnese, procedimento, fotos, fechamento e termo. Ao registrar o procedimento, o lote
usado baixa do estoque. As fotos seguem quatro enquadramentos fixos, com o contorno da foto anterior
como guia.

### Financeiro **(em breve, etapa 6)**
Lançamentos com valor cobrado, custos, imposto e taxa da maquininha, lucro e margem. Margem abaixo
de 28% fica destacada. Reserva automática: 10% para recompra, 5% para emergência, o restante para
retirada.

### Estoque **(em breve, etapa 4)**
Produto, rendimento, custo por atendimento, quantidade, lote e validade, com status OK, Baixo, Vence
e Repor. Entrada por nota e baixa automática no fechamento.

### Relatórios **(em breve, etapa 6)**
Seis meses de faturamento e lucro, mix por linha de procedimento, guia de margem e exportação em CSV
e PDF para o contador.

### Mensagens **(em breve, etapa 7)**
Lembretes automáticos por WhatsApp: 24h antes, preparo 48h antes, pós-procedimento em 1 dia, retorno
em 14 dias, política de falta e aniversário. A paciente responde "1" para confirmar e "2" para
devolver o horário à lista de espera.

### Termos de consentimento **(em breve, etapa 5)**
Modelos versionados — uma versão nova nunca sobrescreve a anterior. Assinatura na tela ou por link,
e o PDF guarda a versão assinada com hora, endereço de rede e um código que prova que o documento
não foi alterado depois.

### Portal da paciente **(em breve, etapa 7)**
A paciente confirma ou reagenda o próximo horário, lê as orientações de preparo e baixa termos e
recibos.

---

## Ainda com dúvida?

Se a resposta não está aqui, fale com quem administra a clínica. Para dúvida técnica ou coisa que
parece defeito, o runbook de operação está em [`operacao.md`](operacao.md); o que cada tela vai ter
está em [`especificacao.md`](especificacao.md).
