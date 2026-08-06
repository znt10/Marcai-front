type Variante = 'normal' | 'dash' | 'fill' | 'sel' | 'mut';

const estilos: Record<Variante, string> = {
  normal: 'bg-white border-traco',
  dash:   'bg-white border-traco border-dashed text-apagado',
  fill:   'bg-traco border-traco text-white text-center py-2.5',
  sel:    'bg-white border-traco border-[2.5px] shadow-[var(--shadow-sel)]',
  mut:    'bg-mut border-mut-borda text-apagado',
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
      className={`border-[1.5px] rounded-wf px-2.5 py-2 text-xs ${estilos[variante]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
