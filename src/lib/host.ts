// Duas regras sobre hostname, e nada mais.
//
// Moradia própria, longe de `tenant.ts`, por um motivo de empacotamento: `tenant.ts`
// importa `next/headers` e o Prisma, então quem o importa vira código de servidor. O
// painel da revenda precisava só destas duas funções puras num componente de cliente,
// e arrastava o banco inteiro para o bundle do browser — o build quebrava pedindo
// `dns`, `fs`, `net` e `tls`. Aqui não há o que arrastar.
//
// `tenant.ts` reexporta as duas, então quem já as importava de lá continua funcionando.

/** True for a hostname that only exists on this machine. */
export function isLocalHost(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:|$)|\.localhost(:|$)/.test(host);
}

/** Local development is the only place the product is not behind TLS. */
export function originFor(host: string): string {
  return `${isLocalHost(host) ? 'http' : 'https'}://${host}`;
}
