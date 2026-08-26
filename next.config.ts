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

const nextConfig: NextConfig = {
  output: "standalone",
  ...(dominio ? { allowedDevOrigins: [dominio, `*.${dominio}`] } : {}),
};

export default nextConfig;
