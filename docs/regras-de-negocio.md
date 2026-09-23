# Regras de negócio — precificação

Fonte da verdade: a planilha `data/precificacao_clinica_dra_tati_mayumi.xlsx` (fora do git — ver
[README](../README.md#dados-da-planilha)). Este documento transcreve o que o código precisa
implementar, para que não seja necessário abrir a planilha a cada dúvida.

**As fórmulas abaixo entram no código exatamente como estão aqui, cobertas por testes unitários com
os valores da planilha** (CLAUDE.md). Elas chegam na etapa 4 (fechamento do atendimento) e na
etapa 6 (financeiro); a etapa 2 traz os parâmetros e o catálogo.

---

## Parâmetros

Editáveis por tenant, com histórico (`pricing_params`):

| Parâmetro | Valor inicial |
|---|---|
| Impostos | 6% |
| Maquininha à vista | 4,5% |
| Maquininha parcelado | 15% |
| Custos fixos | R$ 4.500 / mês |
| Atendimentos previstos | 40 / mês |
| **Rateio por atendimento** | fixos ÷ atendimentos = **R$ 112,50** |
| Margem padrão | 30% |

Pix e dinheiro **não** pagam maquininha.

---

## Composição do custo

```
custo de material  = custo de compra ÷ rendimento      (toxina rende 1,5)
custo da sala      = horas × valor-hora                 (Tatuapé R$ 77; Parque do Carmo R$ 35)
custo total        = material + sala + descartáveis + rateio
```

Descartáveis padrão, por tipo de procedimento:

| Procedimento | Descartáveis |
|---|---|
| Toxina | R$ 40 |
| Labial | R$ 55 |
| Bioestimulador | R$ 65 |
| Skinbooster | R$ 45 |
| Mandíbula | R$ 55 |

---

## Preço sugerido

```
preço à vista    = custo total ÷ (1 − impostos − taxa à vista   − margem)
preço parcelado  = custo total ÷ (1 − impostos − taxa parcelado − margem)
```

- Lucro por atendimento é calculado **sobre o preço à vista**.
- Lucro por hora = lucro ÷ horas de sala.
- **Nunca permitir preço abaixo do custo total** — bloquear ou exigir confirmação explícita.

### Valores de referência para os testes

Restylane Kysse, sala do Tatuapé:

| | Valor |
|---|---|
| À vista | **R$ 1.142,02** |
| Parcelado | **R$ 1.386,73** |

---

## Realizado (o que de fato entrou)

```
lucro líquido    = cobrado − custo total − impostos − taxa (conforme a forma de pagamento)
margem realizada = lucro líquido ÷ cobrado
```

Margem realizada abaixo de **28%** aparece destacada em `--color-accent-700` na tela de Financeiro.

---

## Reservas

Do lucro líquido: **10%** para recompra de insumos, **5%** para emergência, o restante para
retirada.

---

## Catálogo inicial

As abas **"Materiais"** e **"Salas"** da planilha viram seed do banco na etapa 2 (`products`,
`rooms`). A aba **"Orientação"** tem as faixas de margem que a tela de Relatórios exibe como guia
(etapa 6).

---

## Operação

Alertar para reavaliar custos a cada 3 meses — preço de insumo e valor-hora de sala mudam, e uma
tabela velha corrói a margem sem avisar.
