/// A pastilha: horário livre na tela do cliente, ação curta no painel.
///
/// `dado` liga a fonte tabular. Vale para horário — `09:00` e `14:30`
/// precisam ter a mesma largura para a fileira não dançar — e não vale para
/// verbo ("faço", "não faço"), que é texto.
export function Chip({
  ativo = false, acento = false, dado = false, className = '', children, ...props
}: {
  ativo?: boolean;
  acento?: boolean;
  dado?: boolean;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cor = ativo
    ? 'bg-acento text-fundo border-acento font-semibold shadow-[var(--shadow-sel)]'
    : acento
      ? 'bg-superficie border-acento text-acento'
      : 'bg-superficie border-borda text-tinta hover:border-acento';
  return (
    <button
      type="button"
      className={`border rounded-full px-3 py-1.5 text-[12px] shrink-0
                  md:px-4 md:py-1.5 md:text-[13px] transition-colors
                  disabled:opacity-35 disabled:hover:border-borda
                  ${dado ? 'font-dado tracking-tight' : ''} ${cor} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
