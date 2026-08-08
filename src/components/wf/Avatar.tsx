export const Avatar = ({ tamanho = 26 }: { tamanho?: number }) => (
  <div
    className="rounded-full border border-borda bg-mut shrink-0"
    style={{ width: tamanho, height: tamanho }}
  />
);
