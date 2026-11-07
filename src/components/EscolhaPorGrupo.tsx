'use client';
import { useEffect, useRef, useState } from 'react';
import { Gaveta } from '@/components/Gaveta';
import { agrupar, type GrupoDeServico } from '@/lib/grupos';

type Item = { id: string; nome: string; grupoId: string | null };

/// A escolha de serviço quando a casa usa grupos (06/11/2026). Sem grupos,
/// devolve a lista solta de sempre, então quem usa não muda nada.
///
/// As regras de abrir e fechar:
/// - tudo começa FECHADO, porque o objetivo é a tela não ficar comprida;
/// - um grupo só já vem aberto (fechado, seria um toque à toa);
/// - se já há um escolhido ao chegar (volta do calendário), o grupo dele abre;
/// - ao escolher, a gaveta fecha e o cabeçalho mostra o que foi escolhido.
export function EscolhaPorGrupo<T extends Item>({
  itens, grupos, escolhido, aoEscolher, lista,
}: {
  itens: T[]; grupos: GrupoDeServico[]; escolhido: string;
  aoEscolher: (id: string) => void;
  /// Desenha uma lista de itens; `escolher` é o que o botão de cada item chama.
  lista: (itens: T[], escolher: (id: string) => void) => React.ReactNode;
}) {
  const separado = agrupar(itens, grupos);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  // Recalcula a abertura inicial só quando o CONJUNTO de grupos muda (outro
  // profissional, outra casa) — nunca a cada toque.
  const chave = separado?.gavetas.map((g) => g.grupo.id).join('|') ?? '';
  const ultimaChave = useRef<string | null>(null);
  useEffect(() => {
    if (!separado || ultimaChave.current === chave) return;
    ultimaChave.current = chave;
    const inicial = new Set<string>();
    if (separado.gavetas.length === 1) inicial.add(separado.gavetas[0].grupo.id);
    const doEscolhido = itens.find((i) => i.id === escolhido)?.grupoId;
    if (doEscolhido) inicial.add(doEscolhido);
    setAbertos(inicial);
    // `itens`/`escolhido` de propósito fora: só o momento da chegada conta.
  }, [chave]);

  if (!separado) return <>{lista(itens, aoEscolher)}</>;

  const umSo = separado.gavetas.length === 1;
  const alternar = (id: string) => setAbertos((a) => {
    const n = new Set(a);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <div className="flex flex-col gap-2">
      {separado.gavetas.map(({ grupo, itens: doGrupo }) => {
        const escolhidoAqui = doGrupo.find((i) => i.id === escolhido);
        return (
          <Gaveta key={grupo.id} grupo={grupo} quantidade={doGrupo.length}
                  aberta={abertos.has(grupo.id)} alternar={() => alternar(grupo.id)}
                  resumo={escolhidoAqui?.nome}>
            {lista(doGrupo, (id) => {
              aoEscolher(id);
              // Com um grupo só, fechar esconderia a lista inteira por nada.
              if (!umSo) setAbertos((a) => { const n = new Set(a); n.delete(grupo.id); return n; });
            })}
          </Gaveta>
        );
      })}
      {separado.soltos.length > 0 && lista(separado.soltos, aoEscolher)}
    </div>
  );
}
