import type { NextConfig } from "next";

// Em dev o Next 16 so' serve /_next/* para a propria origem: qualquer outra
// leva 403. Como o tenant DESTE produto e' o host, toda pagina e' servida de
// um subdominio — e no celular nem `localhost` existe. Sem esta lista o HTML
// chega, o JS nao, e a pagina fica inerte: o botao "entrar" nunca habilita
// porque o onChange que preencheria o estado nunca foi ligado.
//
// Derivado de NEXT_PUBLIC_DOMINIO_BASE de proposito, para nao existir IP
// escrito aqui: apontou o dominio para outro lugar, a permissao vai junto.
// So' vale em `next dev`; `next start` ignora.
const dominio = process.env.NEXT_PUBLIC_DOMINIO_BASE;

// No modo barbearia-padrao (ver NEXT_PUBLIC_TENANT_PADRAO no proxy.ts) o host
// e' o IP da maquina na rede, que muda a cada DHCP — nao ha o que escrever
// aqui, entao entram as FAIXAS privadas. Nenhum IP publico casa com elas.
//
// Isto nao afrouxa nada que ja nao estivesse aberto: a porta 3000 e' publicada
// na rede de qualquer jeito, entao quem alcanca estes IPs ja baixava o HTML. O
// que `allowedDevOrigins` guarda e' o site MALICIOSO fazendo o navegador de
// alguem buscar /_next de outra origem — e um site na internet nao tem origem
// 10.x. Vale so' em `next dev`, e so' com a variavel ligada a mao.
const REDE_LOCAL = ["10.*.*.*", "192.168.*.*", "172.*.*.*"];
const padrao = process.env.NEXT_PUBLIC_TENANT_PADRAO;

const origens = [
  ...(dominio ? [dominio, `*.${dominio}`] : []),
  ...(padrao ? REDE_LOCAL : []),
];

// `standalone` existe para o Dockerfile, que copia `.next/standalone` para uma
// imagem sem node_modules. Na Vercel ele NAO pode existir: o build com
// Turbopack morre em `ENOENT .next/next-server.js.nft.json` — o rastreamento
// de arquivos que o modo standalone pede nao e' gerado la, e a plataforma
// empacota a saida do proprio jeito, entao o modo nao acrescenta nada.
// `VERCEL` e' definida pela plataforma durante o build.
const nextConfig: NextConfig = {
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  ...(origens.length ? { allowedDevOrigins: origens } : {}),
};

export default nextConfig;
