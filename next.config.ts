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

// A origem do Django, para o rewrite de `/api/*` abaixo.
//
// SEM o prefixo `NEXT_PUBLIC_`, e isso e' o ponto inteiro: aquele prefixo
// manda o Next INLINAR o valor no bundle do navegador, e um valor no bundle
// e' um valor que o navegador usa — ele passaria a chamar o Django DIRETO,
// noutro dominio registravel. Ai o cookie de sessao vira third-party, e o
// Safari (todo iPhone) bloqueia third-party por padrao: o login pararia de
// funcionar em metade dos aparelhos, sem erro nenhum na tela.
//
// Lida so' aqui, no processo do servidor. O navegador nunca sabe que o
// Railway existe: ele fala com `brutus.marcai.api.br` e mais nada.
// A barra final sai aqui, e nao na disciplina de quem preenche a variavel: com
// `https://...railway.app/` o destino vira `...app//api/...`, e o Django
// responde 404 para toda rota — foi exatamente o que aconteceu no primeiro
// deploy com o proxy ligado.
const apiInterna = process.env.API_INTERNA_URL?.trim().replace(/\/+$/, "");

// `standalone` existe para o Dockerfile, que copia `.next/standalone` para uma
// imagem sem node_modules. Na Vercel ele NAO pode existir: o build com
// Turbopack morre em `ENOENT .next/next-server.js.nft.json` — o rastreamento
// de arquivos que o modo standalone pede nao e' gerado la, e a plataforma
// empacota a saida do proprio jeito, entao o modo nao acrescenta nada.
// `VERCEL` e' definida pela plataforma durante o build.
const nextConfig: NextConfig = {
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),

  // Sem isto o Next responde 308 tirando a barra final ANTES do proxy.ts e de
  // qualquer rewrite — e toda URL do admin do Django termina em `/`
  // (`/admin/django/`, `/admin/django/tenant/barbearia/`). Sem
  // `CommonMiddleware` no Django, a forma sem barra e' 404. O resto do site
  // mantem o redirecionamento de antes: quem o faz agora e' o proxy.ts.
  skipTrailingSlashRedirect: true,
  ...(origens.length ? { allowedDevOrigins: origens } : {}),

  // `/api/*` sai do Next e vai para o Django, de servidor para servidor.
  //
  // E' isto que faz `NEXT_PUBLIC_API_URL="443"` fechar o circuito: com a
  // porta padrao do HTTPS, `origemDoTenant()` (lib/api/client.ts) devolve a
  // PROPRIA origem da pagina, o pedido volta para o Next, e este rewrite o
  // entrega ao Django. Para o navegador tudo e' same-origin — sem CORS, sem
  // `SameSite=None`, e o cookie continua host-only como em dev, onde front e
  // back so' diferiam na porta.
  //
  // O casamento e' `/api/*` e NADA MAIS. `/admin/*` fica de fora de
  // proposito: no Next essas sao as PAGINAS do painel da plataforma, e o
  // Django tem um `/admin/django/` proprio — mandar o prefixo inteiro para la
  // engoliria o painel.
  //
  // Sem a variavel nao ha rewrite nenhum: em dev o navegador fala direto com
  // a porta 8000, que e' o arranjo que `origemDoTenant()` ja monta sozinho.
  ...(apiInterna
    ? {
        rewrites: async () => [
          { source: "/api/:caminho*", destination: `${apiInterna}/api/:caminho*` },
        ],
      }
    : {}),
};

export default nextConfig;
