import type { Tipo } from '@/lib/tipos';

/// O logo no topo das telas do cliente.
///
/// O desenho da marca do Marcaí é uma NAVALHA com o poste de barbearia: na
/// barbearia ele é o de sempre, mas na página de um estúdio seria a "cara de
/// barbearia" que o tipo existe para tirar (spec 2026-10-08). Estética,
/// manicure e maquiagem têm o desenho delas (22/10/2026, em `public/marcas`);
/// o "outro" fica com a inicial do estabelecimento, nas cores da paleta dele.
///
/// Os desenhos são o rosé do kit (#A35A57) sem fundo (28/10/2026): no tema
/// Rosé a logo fica no tom da tela, e não um quadrado colado nela. Nem todo
/// desenho é quadrado (a sobrancelha é larga), daí o `object-contain`. A
/// barbearia também perdeu o quadrado marrom (`marcas/barbearia.png`, o
/// dourado do `marca-512.png` recortado); o `marca.png` com fundo fica só
/// para o ícone de instalar, que precisa de fundo.
///
/// Sem hook: serve ao Server Component (o cabeçalho) e ao Client Component (a
/// vitrine) do mesmo jeito.
const DESENHO: Partial<Record<Tipo, string>> = {
  SOBRANCELHA: '/marcas/estetica.png',
  MANICURE: '/marcas/manicure.svg',
  MAQUIAGEM: '/marcas/maquiagem.png',
};

export function Marca({ tipo, nome, tamanho, className = '' }: {
  tipo?: Tipo; nome: string; tamanho: number; className?: string;
}) {
  if (!tipo || tipo === 'BARBEARIA' || DESENHO[tipo]) {
    const src = (tipo && DESENHO[tipo]) || '/marcas/barbearia.png';
    return <img src={src} alt="" width={tamanho} height={tamanho} className={`shrink-0 object-contain ${className}`} />;
  }
  return (
    <span aria-hidden style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.56) }}
          className={`inline-flex shrink-0 items-center justify-center bg-acento font-letreiro font-extrabold
                      leading-none text-fundo ${className}`}>
      {nome.trim().charAt(0).toUpperCase()}
    </span>
  );
}
