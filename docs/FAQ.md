# FAQ — como usar o sistema

Perguntas na linguagem de quem opera a clínica. Se algo aqui não corresponde ao que você vê na
tela, o sistema está errado, não o texto — avise.

> **Onde estamos:** etapas 1 a 7 prontas — entrar no sistema, perfis de acesso, uma instância por
> clínica, **cadastro de pacientes**, configurações, agenda com **marcação de horário**, **estoque
> por lote**, a **ficha de atendimento com fechamento financeiro**, as **fotos clínicas** e os
> **termos de consentimento com assinatura e PDF**, o **financeiro**, os **relatórios**, as
> **mensagens no WhatsApp** e o **portal da paciente**. Falta a anamnese versionada e o painel da
> revenda (etapa 8).

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

Há também telas que você abre para **consultar** e não para **alterar**: o profissional convidado vê
a própria agenda e as próprias pacientes, mas quem cadastra e marca horário é a recepção ou a
doutora. Tentar pelo endereço direto devolve um aviso — e fica registrado.

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

### Como cadastro uma paciente?

Em **Pacientes**, botão **Nova paciente**, no alto da lista. Só o nome completo é obrigatório —
telefone, e-mail, nascimento e CPF podem entrar depois, quando ela chegar. Ao salvar, o sistema
volta para a lista já com a ficha dela aberta no painel lateral.

Quem cadastra é a recepção ou a doutora. O profissional convidado consulta, mas não cadastra.

### Preciso do CPF?

Não. Se você preencher, o sistema confere os dígitos e recusa um número inválido na hora — é o
tipo de erro que só aparece na nota fiscal, meses depois. E a mesma paciente não pode ser
cadastrada duas vezes com o mesmo CPF, para o histórico não se partir em duas fichas.

### Errei um dado. Como corrijo?

Abra a paciente na lista e clique em **Editar cadastro**. Corrigir contato não mexe em nada do
histórico de atendimentos.

### Cadastrei e o sistema recusou

A mensagem diz o que falta, e **nada do que você digitou se perde** — corrija só o campo apontado e
salve de novo. As recusas mais comuns: nome com menos de três letras, telefone sem DDD, data de
nascimento no futuro e CPF com dígito errado.

### Como tiro uma paciente da lista?

Em **Editar cadastro**, desmarque **Paciente ativa**. Ela sai do filtro "Ativas" e da lista de quem
pode ser agendada, mas nada é apagado: atendimentos, fotos e termos continuam no lugar.

### Como encontro uma paciente?

Em **Pacientes**. A lista vem em ordem alfabética e a busca aceita nome, telefone ou e-mail — digite
e clique em Buscar. Os filtros no topo mostram todas, só as ativas, ou só as que têm alerta clínico.

### O que é o "alerta clínico"?

A linha que não pode passar batido antes de um procedimento: uma alergia, um anticoagulante em uso,
uma reação anterior. Ela aparece destacada no painel lateral e como etiqueta na lista. **Não é o
prontuário** — é o aviso curto que precisa saltar aos olhos.

### Onde está o prontuário da paciente?

Na ficha de atendimento: abra a **Agenda** e clique no nome dela. Abrir prontuário, anamnese ou
fotos exige 2FA e fica registrado no log de auditoria.

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

### Como marco um horário?

Duas formas, as duas em **Agenda**:

- o botão **Novo agendamento**, que abre o formulário no dia em que você está;
- ou, na visão **Dia**, clicar direto na faixa **Livre · agendar** da hora que você quer — ela já
  leva o dia, a hora e a sala filtrada para o formulário.

Escolha a paciente, o dia, o horário e a sala. O procedimento é opcional e, quando escolhido, já
preenche a duração típica daquele atendimento — que você pode mudar. A situação nasce como
**Aguardando**; marque **Confirmado** se a paciente já confirmou.

Se a paciente tiver **alerta clínico**, ele aparece em destaque assim que você a escolhe.

### "A sala já tem um atendimento nesse horário"

Uma sala atende uma paciente por vez, então o sistema recusa e diz **com quem** é o choque e **em
que horário**. Mude a hora ou a sala e agende de novo — o resto do formulário continua preenchido.
A conferência é por sobreposição, não por hora cheia: um atendimento de 1h30 que começa às 14h
bloqueia também as 15h.

### Posso agendar fora do horário de funcionamento?

Não. A agenda vai das 8h às 19h, e um horário fora disso é recusado — ele existiria no banco mas
não apareceria na grade do dia.

### Quem pode agendar?

A recepção e a doutora. O profissional convidado enxerga a própria agenda, mas não marca horário.

### O que é um "Bloqueio"?

Uma faixa listrada sem paciente: almoço, deslocamento, ou uma sala que não foi contratada naquela
hora. É a agenda dizendo "indisponível", e não "vago".

### O que significam as cores dos status?

**Confirmado** (destaque), **Aguardando** (contorno) e **Atendido** (neutro). Faltou e Cancelado
aparecem também, quando for o caso.

### Filtrei por sala e sumiu tudo

O filtro mostra só o que está marcado naquela sala. Volte em **Todas as salas** para ver a agenda
inteira.

### Cliquei numa paciente e abriu a ficha de atendimento

É isso mesmo: na agenda, o nome da paciente é o caminho para a ficha do dia.

### Sou profissional convidado e vejo pouca coisa

Você vê a sua agenda. Os horários de outro profissional não aparecem para você.

### No celular

A tira de dias no topo troca o dia com um toque, e cada atendimento vira um card. Os alvos são
grandes o suficiente para o dedo.

---

## Atendimento e fechamento

### Como abro a ficha de uma paciente?

Pela **Agenda**: clique no nome dela. A ficha mostra o horário, a sala, o procedimento e — se
houver — o alerta clínico em destaque.

### O que o "preço sugerido" leva em conta?

Tudo: o custo do produto dividido pelo rendimento, a sala pelas horas do atendimento, os
descartáveis do procedimento e o rateio dos custos fixos. Sobre esse custo aplica a margem, já
líquida de impostos e maquininha. O painel lateral mostra a conta aberta, parcela por parcela.

### Preciso escolher o lote?

Não. O sistema escolhe sozinho o lote que **vence primeiro**, para não perder produto na validade.
A ficha registra qual lote foi usado, e isso fica guardado — é o que permite rastrear se um dia
houver recall ou reação.

### Posso cobrar menos que o sugerido?

Pode. Desconto sai da margem, não do custo. Mas se o valor ficar **abaixo do custo total**, o
sistema avisa e só fecha depois que você confirmar — nunca deixa passar sem você ver.

### O que acontece quando eu fecho?

Três coisas de uma vez: grava o pagamento com a decomposição de custos, **baixa uma unidade do
lote** no estoque, e marca o atendimento como Atendido na agenda. Ou tudo acontece, ou nada — não
existe meio-fechamento.

### Fechei errado. E agora?

Um atendimento fechado não fecha de novo — a tela passa a mostrar o resultado. Correção de
lançamento entra com o financeiro (etapa 6).

### Por que no Pix a margem sai maior?

Porque não há taxa de maquininha. O preço sugerido embute a taxa; se a paciente paga em Pix ou
dinheiro, essa taxa não é cobrada de você e vira margem.

---

## Estoque

### O que significam os status?

- **OK** — quantidade confortável e validade distante.
- **Baixo** — 2 unidades ou menos.
- **Vence** — algum lote vence nos próximos 90 dias.
- **Repor** — sem unidade utilizável, ou tudo vencido.

### Um lote venceu e ainda tem unidades. Ele aparece como estoque?

Não. Lote vencido não conta como disponível e nunca é escolhido num fechamento — ele precisa ser
baixado como perda, não usado.

### Quem vê o custo dos produtos?

Só a doutora. Recepção e financeiro veem quantidade, lote, validade e status — não o que a clínica
paga no produto.

### Como dou entrada de nota?

Em **Estoque**, botão **Entrada de nota**. Escolha o produto na lista — ou **Produto novo**, se a
marca chega pela primeira vez — e informe o número do lote (como está impresso na caixa), a
validade, quantas unidades vieram e, se quiser, a nota fiscal.

Quem lança é a doutora ou o financeiro. A recepção abre o Estoque para consultar quantidade e
validade, mas não vê custo e não dá entrada — é o mesmo motivo: custo não é do perfil dela.

### Produto novo: o que o sistema pede?

Marca, procedimento, unidade de compra (o que está escrito na nota: "Frasco 50U", "Seringa 1ml"),
**custo de compra** e **rendimento**.

O rendimento é quantos atendimentos uma unidade comprada cobre: um frasco que atende uma paciente é
1; um que atende uma e meia é 1,5. Custo e rendimento juntos dão o custo por atendimento, que entra
no preço sugerido — por isso o sistema não deixa nenhum dos dois em branco.

### O produto está como "Repor". Preciso cadastrar de novo?

Não. **Repor** quer dizer que a quantidade utilizável chegou a zero — os lotes acabaram, ou o que
sobrou está vencido. O produto continua no catálogo.

Faça uma **Entrada de nota** escolhendo o produto **que já existe na lista** e informando o lote
novo: número, validade e quantidade. A quantidade sobe e o status sai de Repor sozinho.

Cadastrar produto novo só quando mudar a coisa: outra marca, ou a mesma marca em outra
apresentação — Frasco 50U e Frasco 100U são produtos diferentes, porque o rendimento e o custo por
atendimento são diferentes. Tentar cadastrar a mesma marca no mesmo procedimento é recusado.

### Por que cada compra vira um lote novo, em vez de somar no que já existe?

Porque o lote é o que liga o frasco à paciente. Se o fornecedor recolher um lote, ou se alguma
paciente tiver uma reação, a pergunta é "quem recebeu deste lote" — somar a compra nova dentro do
lote antigo apagaria essa resposta. É também o que faz a baixa automática consumir primeiro o que
vence antes.

### Este lote veio por outro preço

Preencha **Custo deste lote**. Em branco, ele assume o custo cadastrado no produto. O lote guarda o
que foi pago por ele, então um atendimento antigo continua explicável mesmo depois de o fornecedor
mudar de preço.

### "Já existe um lote com esse número para este produto"

Esse lote já foi lançado — lote é único por produto. Se chegou mais caixa do **mesmo** lote, o certo
é corrigir a quantidade do lote existente, e para isso ainda não há tela: fale com quem administra o
sistema. Se o número na caixa é outro, é outro lote: lance normalmente.

### O fornecedor mudou o preço. Onde eu atualizo?

No lançamento, **Custo deste lote** guarda o que você pagou nesta compra — é isso que mantém um
atendimento antigo explicável. Mas o **custo cadastrado no produto**, que é o que alimenta o preço
sugerido, ainda **não é editável por tela**: ele é definido quando o produto nasce. Enquanto não
houver essa tela, mudanças definitivas de preço passam por quem administra o sistema.

### Lancei sem validade

O lote entra, mas nunca aparece como "vence" e não participa da regra de usar primeiro o que vence
antes. Vale voltar e preencher assim que tiver a caixa em mãos — hoje isso também é pela
administração do sistema.

---

## Termos de consentimento

### Quem escreve o texto do termo?

A doutora, em **Termos**. A recepção emite, envia o link e colhe a assinatura, mas não mexe no
texto — é decisão clínica, não de atendimento.

### Como escrevo um termo novo?

**Termos** → **Novo termo**. Dê um título, escreva o texto e publique. Uma linha em branco separa
parágrafos. No meio do texto você pode usar os campos `{{paciente}}`, `{{procedimento}}`,
`{{clinica}}` e `{{data}}`: eles são preenchidos na hora de emitir para cada paciente.

### Preciso corrigir um termo que já usei. Perco as assinaturas?

Não. Em **Nova edição**, o que você salva vira a **edição seguinte** e passa a valer daqui para
frente. Tudo que já foi assinado continua com o texto do dia em que foi assinado — é para isso que
as edições existem. Na tela de um termo antigo o sistema avisa: "o modelo já está na 2".

### Como faço a paciente assinar?

Emita o termo (em **Termos** → **Emitir termo**, ou pela ficha de atendimento, em **Emitir termo**)
e escolha um dos dois caminhos:

- **Na tela**: entregue o celular ou o tablet para ela assinar com o dedo, ali mesmo na recepção.
- **Por link**: clique em **Gerar link de assinatura**, copie e mande para ela. Ela abre no celular
  dela, lê e assina — sem precisar de senha nem de conta.

### O link não aparece mais quando volto na tela

Ele aparece **uma vez só**. O sistema guarda apenas uma impressão digital do link, não o link em
si — do mesmo jeito que faz com as senhas. Se você fechou sem copiar, clique em **Gerar novo link**:
o anterior deixa de funcionar na hora.

### Mandei o link para a pessoa errada

Gere outro. O link antigo para de valer no mesmo instante.

### Quanto tempo o link dura?

Três dias. Depois disso a paciente vê um aviso pedindo um link novo, e o termo continua aguardando
assinatura.

### O que é aquele código embaixo do PDF?

A prova de que o documento não foi alterado. Ele é calculado a partir do texto, do nome de quem
assinou, do instante da assinatura e do próprio traço. Mudar qualquer um deles muda o código — se
alguém questionar o termo, é ele que responde.

### Onde baixo a via assinada?

Na lista de **Assinados**, coluna **PDF**, ou na tela do termo, em **Baixar PDF**. A paciente que
assinou por link baixa a dela na própria tela, logo depois de assinar.

### O texto saiu com uma linha em branco no lugar do procedimento

O termo foi emitido fora de um atendimento, então o sistema não tinha o procedimento para escrever
e deixou a linha para preencher à mão. Emitindo pela ficha do atendimento, o campo já vem
preenchido.

### Cancelei sem querer

Um termo cancelado não pode ser reaberto — emita outro. O link do cancelado deixa de funcionar na
hora, o que é justamente o motivo de existir o cancelamento.

---

## Fotos clínicas

### Como tiro as fotos?

Na ficha do atendimento, em **Fotos clínicas**. São quatro enquadramentos fixos — frontal, perfil
esquerdo, perfil direito e terço superior. Pelo celular, o botão abre a câmera direto.

### O que é aquela imagem apagada no fundo?

A foto da **sessão anterior**, no mesmo enquadramento, para você alinhar a nova. Assim o antes e
depois compara de verdade, em vez de comparar ângulos diferentes.

### Onde as fotos ficam guardadas?

Num armazenamento privado, separado do sistema. Elas **não passam pelo servidor**: vão do seu
aparelho direto para lá. Não existe link público — cada visualização gera um endereço que vale
poucos segundos e depois morre.

### Quem pode ver?

Só quem o perfil permite: a doutora vê todas, o profissional convidado vê parcialmente, e recepção e
financeiro **não veem nenhuma**. Toda visualização fica registrada no log de auditoria, com quem
abriu e quando.

### A foto demora a abrir

Cada abertura pede um endereço novo ao armazenamento, de propósito — nada fica em cache no
navegador. É o custo de a foto não ficar acessível por um link solto.

### Posso substituir uma foto?

Pode: enviar de novo no mesmo enquadramento substitui a que aparece. O histórico permanece.

### Apagar as fotos de uma paciente

Apagar a paciente apaga as fotos dela também — inclusive os arquivos, não só os registros. É
operação de administração; peça a quem cuida do sistema.

---

## Financeiro

### O que aparece no Financeiro?

O mês corrente, com cinco números no topo — faturamento, custos, impostos e taxas, lucro líquido e
margem realizada — e, abaixo, um lançamento por atendimento fechado. As setas andam mês a mês e
**Este mês** traz você de volta.

### De onde vêm esses valores?

Do fechamento de cada atendimento. Cada lançamento guarda o que foi cobrado, o custo decomposto
(material, sala, descartáveis e rateio), o imposto, a taxa da maquininha e o lucro — como estavam no
dia. Mudar os parâmetros em Configurações **não reescreve** o passado: um lançamento antigo continua
explicável pelos números que valiam quando aconteceu.

### Por que uma margem aparece destacada?

Porque ficou **abaixo de 28%**. É o limite a partir do qual qualquer imprevisto — um lote perdido,
uma sala mais cara — come o lucro daquele atendimento.

### O que é o card de reservas?

A separação do lucro líquido do mês: **10%** para recompra de insumos, **5%** para emergência, e o
restante é a retirada. Se o mês fechar no vermelho, os três números ficam negativos — é a conta
dizendo que não há o que reservar.

### Sou da recepção e não vejo custo nem margem

É o perfil funcionando como previsto. Você confere data, paciente, procedimento, forma de pagamento
e o valor cobrado; custo, imposto, lucro e margem ficam com a doutora e com o financeiro.

---

## Relatórios

### O que o gráfico mostra?

Os últimos seis meses. A barra **em contorno** é o faturamento do mês; a **preenchida** ao lado é o
lucro líquido — quanto daquele faturamento ficou. O mês corrente aparece menor porque ainda está
acontecendo.

### Para que serve o guia de margem?

Para situar a clínica: abaixo de 15% é zona de risco, 15% a 30% é a faixa mínima saudável, 30% a 40%
é a faixa-alvo para injetáveis, acima de 40% é folga. A faixa onde a clínica está no período fica
marcada.

### Como mando os números para o contador?

**Exportar CSV** baixa um arquivo que abre direto no Excel em português — ponto e vírgula entre
colunas, vírgula nos centavos e acentos corretos. **Exportar PDF** gera o mesmo período em uma
página, para anexar num e-mail.

### O arquivo tem o nome das pacientes?

Não. O que sai é data, mês, procedimento, produto, forma de pagamento e os valores. Quem foi
atendida não é assunto da contabilidade, e uma planilha viaja mais longe do que se planeja.

### Exportei e o Excel embaralhou as colunas

Abra pelo Excel em português (o arquivo já vem no formato dele). Se sua planilha estiver configurada
em inglês, importe escolhendo **ponto e vírgula** como separador.

---

## Mensagens no WhatsApp

### O que sai automaticamente?

Seis automações, cada uma com o seu texto, que você edita em **Mensagens**:

- **Lembrete 24h antes** — na véspera, às 10h.
- **Preparo 48h antes** — dois dias antes, às 10h, com o que evitar.
- **Pós-procedimento** — no dia seguinte ao atendimento, às 10h.
- **Retorno em 14 dias** — duas semanas depois, às 10h.
- **Política de falta** — na hora em que você marca o horário como falta.
- **Aniversário** — no dia, às 9h.

Cada uma pode ser ligada ou desligada. Ao lado do texto, a prévia mostra a mensagem exatamente como
ela chega no celular da paciente.

### Como escrevo o texto?

No campo **Texto**, usando os campos entre chaves: `{{paciente}}`, `{{clinica}}`, `{{data}}`,
`{{hora}}`, `{{procedimento}}` e `{{sala}}`. Um campo sem valor **some** do texto junto com o espaço
— um lembrete emitido fora de um atendimento não mostra "{{sala}}" para a paciente. **Restaurar
texto padrão** volta ao texto que veio com o sistema.

### Editei o texto. E as mensagens que já estavam na fila?

Saem como estavam. O texto é montado e congelado quando a mensagem entra na fila, então a paciente
recebe o que a clínica quis dizer no dia em que aquilo foi agendado.

### "WhatsApp ainda não conectado"

O canal depende de credenciais da Meta que quem cuida da infraestrutura configura. Sem elas as
automações continuam funcionando: a fila enche e **nada se perde**. Quando o canal for ligado, o que
já estiver na hora sai.

### O que a paciente responde?

**1** confirma o horário — ele passa a aparecer como Confirmado na agenda. **2** devolve o horário:
ele é cancelado, os lembretes pendentes dele são cancelados junto, e a recepção vê a resposta na
tela de Mensagens para remarcar. Qualquer outra resposta é só registrada, sem mexer em nada.

### Marquei falta e a mensagem não saiu

Ela entra na fila na hora e sai no próximo envio. A fila aparece em **Mensagens**, na coluna da
direita.

### Como marco confirmação, falta ou cancelamento?

Em **Agenda**, visão **Lista**: cada linha tem **Confirmar**, **Faltou** e **Cancelar**. "Atendido"
não está ali de propósito — quem registra atendimento é o fechamento da ficha.

---

## Portal da paciente

### O que a paciente vê?

Ao entrar com o e-mail dela no endereço da clínica: o próximo horário, com **Confirmar presença** e
**Preciso reagendar**; as orientações de preparo (o mesmo texto da automação de 48h, já preenchido
com o horário dela); os termos que ela assinou, com o PDF para baixar; e os últimos atendimentos com
o valor pago.

### Ela vê o prontuário?

Não. Prontuário, anamnese e fotos ficam na clínica — são dados de saúde e o portal não os expõe. A
tela diz isso para ela, e pede que fale com a recepção se quiser uma cópia.

### "Preciso reagendar" cancela mesmo?

Devolve o horário: ele sai da agenda como cancelado e os lembretes pendentes são cancelados. A
recepção vê e entra em contato. O histórico dela continua intacto.

### Como ligo o acesso de uma paciente ao cadastro dela?

O acesso de portal precisa apontar para o cadastro dela. Ainda não há tela para isso: quem
administra o sistema roda `scripts/link-portal-login.ts` com o e-mail dela e o CPF (ou o nome), e o
comando devolve a senha de primeiro acesso — uma vez só.

### O portal não aparece para a minha clínica

Ele depende do módulo **Portal da paciente** estar ligado em Configurações.

---

## Esta ajuda

### Onde ela fica dentro do sistema?

No menu lateral, em **Sistema → Ajuda**. Todo perfil que trabalha na clínica alcança: doutora,
recepção, financeiro e profissional convidado. A paciente não vê — o portal dela é escrito na
linguagem dela.

### Dá para procurar?

Sim, pela busca no topo da tela. Ela olha a pergunta e a resposta inteira, ignora acentos e
maiúsculas: "prontuario" encontra "prontuário". O índice à esquerda leva direto a um assunto.

### É a mesma ajuda que o time mantém?

É o mesmo arquivo, servido de dentro do sistema — não há uma segunda cópia para ficar
desatualizada. Quando uma tela muda, o texto muda no mesmo commit, e uma versão nova do sistema traz
a ajuda nova junto.

---

## Ainda com dúvida?

Se a resposta não está aqui, fale com quem administra a clínica. Para dúvida técnica ou coisa que
parece defeito, o runbook de operação está em [`operacao.md`](operacao.md); o que cada tela vai ter
está em [`especificacao.md`](especificacao.md).
