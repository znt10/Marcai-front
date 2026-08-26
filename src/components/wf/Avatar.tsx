/// O círculo do barbeiro. Vazio enquanto não houver foto — que é o estado de
/// hoje, porque `Barbeiro.foto_url` existe no banco e ninguém tem como
/// preenchê-lo ainda (não há upload no produto).
///
/// Aceitar `fotoUrl` desde já é o que faz a foto aparecer sozinha no dia em
/// que existir, sem ninguém reabrir as telas que usam este componente.
///
/// `<img>` e não `next/image`: a URL vem do banco, de um domínio que ninguém
/// declarou em `next.config`, e o otimizador recusa origem não configurada.
export const Avatar = ({
  tamanho = 26, fotoUrl = null, nome,
}: { tamanho?: number; fotoUrl?: string | null; nome?: string }) => (
  <div
    className="rounded-full border border-borda bg-mut shrink-0 overflow-hidden"
    style={{ width: tamanho, height: tamanho }}
  >
    {fotoUrl && (
      // `alt` vazio de propósito quando não há nome: o nome do barbeiro já
      // está escrito ao lado em toda tela que usa isto, e repeti-lo faria o
      // leitor de tela dizer duas vezes.
      <img
        src={fotoUrl}
        alt={nome ? `Foto de ${nome}` : ''}
        width={tamanho}
        height={tamanho}
        className="w-full h-full object-cover"
        loading="lazy"
        decoding="async"
      />
    )}
  </div>
);
