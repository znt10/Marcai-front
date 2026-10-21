/// O "voltar" das telas do cliente que não têm outra saída à vista: a conta,
/// a senha nova e o calendário. Um só desenho para os três — antes o do
/// calendário era um "‹ voltar" de 11px em cinza, que ninguém achava, e a
/// conta não tinha nenhum (o cabeçalho volta, mas não parece botão).
///
/// `<a href>` e não `<Link>`, como todo link do fluxo do cliente: ir e voltar
/// é carregamento inteiro de página (ver `@/lib/rascunho`).
export function BotaoVoltar({
  href, rotulo = 'Voltar', ariaLabel,
}: { href: string; rotulo?: string; ariaLabel?: string }) {
  return (
    <a href={href} aria-label={ariaLabel}
       className="inline-flex w-fit items-center gap-1.5 rounded-full border border-borda
                  bg-superficie px-3.5 py-2 text-[13px] md:text-sm font-semibold text-tinta
                  transition-colors hover:border-latao">
      <span aria-hidden className="text-[16px] leading-none">‹</span>
      {rotulo}
    </a>
  );
}
