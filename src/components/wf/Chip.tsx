export function Chip({
  ativo = false, acento = false, className = '', children, ...props
}: {
  ativo?: boolean;
  acento?: boolean;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cor = ativo
    ? 'bg-traco text-white border-traco'
    : acento
      ? 'bg-white border-acento text-acento'
      : 'bg-white border-traco';
  return (
    <button
      type="button"
      className={`border-[1.5px] rounded-full px-2.5 py-1 text-[11px] shrink-0
                  disabled:opacity-45 ${cor} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
