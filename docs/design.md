# Design — protótipo e design system

Referência visual e comportamental. O **escopo** está em [especificacao.md](especificacao.md); a
**stack** no [README](../README.md).

---

## O protótipo

`design/Sistema Clinica.dc.html` é um **protótipo de referência em HTML** — mostra aparência e
comportamento, **não é código de produção**. A tarefa foi (e continua sendo) recriar essas telas na
stack real; não copie o HTML.

Para abrir, sirva a pasta com um servidor estático:

```bash
npx serve design
```

A barra escura no topo **não faz parte do produto**: é o controle do mockup, que troca marca, perfil
e variações de layout. Todos os dados de exemplo estão na classe `Component`, no método
`renderVals()`.

Arquivos:

- `design/Sistema Clinica.dc.html` — o protótipo (template + lógica)
- `design/support.js` — runtime que faz o protótipo rodar
- `design/_ds/classical-…/styles.css` — o design system Classical
- `design/_ds/classical-…/_ds_bundle.js` — bundle do design system

## Fidelidade

**Alta.** Cores, tipografia, espaçamentos e textos são finais. Dados de pacientes são fictícios;
dados de custo e preço vêm da planilha real (ver [regras-de-negocio.md](regras-de-negocio.md)).

---

## Design tokens (Classical)

`src/styles/tokens.css` é uma cópia fiel de `design/_ds/classical-…/styles.css`, com duas mudanças:
o `@import` do Google Fonts saiu (as fontes são auto-hospedadas por `next/font`) e `--color-accent`
é sobrescrita em runtime pela cor do tenant.

**Nunca escreva cor ou fonte literal fora desse arquivo** (CLAUDE.md).

### Cor

- Fundo `#f3f2f2`, surface `#eae9e9`, texto `#201f1d`, acento `#b68235` (por tenant),
  divider = texto a 16%.
- Neutros 100–900: `#f8f4f4` `#eae7e7` `#d7d3d3` `#bab6b6` `#9b9797` `#7d7979` `#605d5d` `#444141`
  `#2d2b2b`
- Acento 100–900: `#fff3e4` `#ffe3bf` `#facb8d` `#e1ad66` `#c28d41` `#a06f24` `#7d5411` `#5a3b0a`
  `#3a270d`
- Tenants de exemplo: Tati `#b68235`, Aurora `#7d5411`, Vértice `#444141`.

A cor de acento do tenant precisa de contraste ≥ 3:1 contra o fundo `#f3f2f2` — validado em
`src/lib/color.ts`, senão a borda do botão primário desaparece no papel.

### Tipografia

- Títulos: Cormorant Garamond (máximo 600; display em 300/400).
- Corpo: Lora.
- Números tabulares em tabelas e KPIs (classe `.num`).
- Kickers: Lora 9–10px, letter-spacing .18–.22em, caixa alta, neutral-600.

### Espaço e forma

- Espaçamento: 4.6 / 9.2 / 13.8 / 18.4 / 27.6 / 36.8px.
- Raio: 2 / 4 / 7px. Sombras sm/md/lg sutis.

### Regras de composição

- Botão primário = **contorno** de acento, nunca preenchido.
- Cards com borda, sem preenchimento.
- Cor entra como traço e borda, não como área.

---

## Assets

Sem imagens reais. Fotos antes/depois são placeholders (classe `.plate`). O logo é um monograma em
círculo até que cada tenant envie o seu. Ícones: [Lucide](https://lucide.dev)
(`src/app/(app)/icons.tsx` mapeia um por módulo).
