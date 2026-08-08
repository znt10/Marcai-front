/// A caixa do sistema. No wireframe havia uma tinta só — a mesma cor era
/// borda, preenchimento e texto, porque no papel tudo é o mesmo lápis. No
/// escuro isso se parte em três coisas diferentes, e é por isso que as
/// variantes existem.
type Variante =
  | 'normal'
  /// O botão que conclui. Um por tela, no máximo.
  | 'fill'
  /// Escolhido: fio de latão e a sombra de letreiro.
  | 'sel'
  /// Desligado — existe, não está valendo.
  | 'mut'
  /// Campo ainda vazio. Aqui o tracejado é literal e fica: falta preencher.
  | 'dash'
  /// Para copiar (link de convite). Era tracejado também, e ali era engano —
  /// tracejado quer dizer "ainda não está pronto", e o link está pronto; ele
  /// só precisa ser selecionado inteiro.
  | 'copia'
  /// Precisa de decisão de gente: conflito de horário, aviso que não some
  /// sozinho.
  | 'alerta';

const estilos: Record<Variante, string> = {
  normal: 'bg-superficie border-borda',
  fill:   'bg-acento border-acento text-fundo text-center py-2.5 md:py-3 '
        + 'font-letreiro uppercase tracking-wide font-semibold shadow-[var(--shadow-sel)]',
  sel:    'bg-superficie border-acento border-[2px] shadow-[var(--shadow-sel)]',
  mut:    'bg-mut border-mut-borda text-apagado',
  // Fundo do CHÃO, não da superfície: campo vazio é buraco, e com `bg-mut`
  // ele fica igual ao botão desligado (`mut`) — na tela de entrada, os três
  // blocos viravam o mesmo bloco.
  dash:   'bg-transparent border-borda border-dashed text-apagado',
  copia:  'bg-fundo border-borda text-sub font-dado text-[11px] md:text-xs',
  alerta: 'bg-superficie border-acento text-tinta',
};

export function Box({
  variante = 'normal', className = '', children, ...props
}: {
  variante?: Variante;
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`border rounded-wf px-3 py-2.5 text-[13px]
                  md:px-4 md:py-3 md:text-sm
                  ${estilos[variante]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
