/// Sem `wrap`, os filhos dividem a largura em partes iguais; com `wrap`,
/// mantêm o tamanho natural e quebram linha — os dois arranjos que o
/// wireframe usa.
export function Row({
  wrap = false, className = '', children,
}: { wrap?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex gap-2 ${wrap ? 'flex-wrap' : '[&>*]:flex-1'} ${className}`}>
      {children}
    </div>
  );
}
