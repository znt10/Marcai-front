import { SUBDOMINIOS_RESERVADOS, SLUG_REGEX } from './config';

/// Vive em módulo próprio, sem nenhuma dependência de banco, porque o
/// `proxy.ts` a importa: qualquer coisa que o proxy toque entra no bundle
/// dele, e arrastar o PrismaClient para lá é caro e desnecessário.
/// `@/lib/tenant` a reexporta — a interface pública combinada é a de lá.
export function extrairSlug(host: string, dominioBase: string): string | null {
  const semPorta = host.split(':')[0].toLowerCase();
  if (semPorta === dominioBase) return null;
  if (!semPorta.endsWith(`.${dominioBase}`)) return null;

  const slug = semPorta.slice(0, -(dominioBase.length + 1));
  if (slug.includes('.')) return null; // subdomínio de subdomínio não é tenant
  if ((SUBDOMINIOS_RESERVADOS as readonly string[]).includes(slug)) return null;
  if (!SLUG_REGEX.test(slug)) return null;
  return slug;
}

/// `extrairSlug` devolve null para DOIS casos diferentes — o domínio nu e um
/// subdomínio reservado — e o proxy precisa distingui-los: um serve a página
/// institucional, o outro serve o painel de admin. Sem esta função,
/// `admin.seuapp.com.br` cairia na vitrine do produto.
export function ehHostAdmin(host: string, dominioBase: string): boolean {
  return host.split(':')[0].toLowerCase() === `admin.${dominioBase}`;
}
