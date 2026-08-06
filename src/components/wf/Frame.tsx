/// A moldura de 300px do wireframe: toda tela nasce dentro dela.
export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-[300px] max-w-full mx-auto p-3.5 flex flex-col gap-2.5
                    bg-white text-traco [font-family:var(--font-mao)]">
      {children}
    </div>
  );
}
