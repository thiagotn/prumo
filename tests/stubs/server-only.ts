// `server-only` é um guard de build: importado de um Client Component, ele lança.
// Nos testes rodamos os módulos de servidor direto no Node, onde essa distinção não
// existe — então o pacote é trocado por este no-op (ver vitest.config.mts).
export {};
