export const Avatar = ({ tamanho = 26 }: { tamanho?: number }) => (
  <div
    className="rounded-full border-[1.5px] border-traco shrink-0"
    style={{ width: tamanho, height: tamanho }}
  />
);
