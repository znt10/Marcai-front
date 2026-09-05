'use client';
import { Frame, Sub } from '@/components/wf';
import { FormMarcar } from '@/components/painel/FormMarcar';
import { useEu } from '@/components/painel/SessaoDoPainel';

export default function Novo() {
  // `eu` vem do provider do layout, buscado uma vez por sessão — não mais
  // uma busca própria desta tela. Sessão morta ainda manda para a entrada:
  // quem decide isso é o cliente da API, pelo `loginEm` de `painelApi`
  // dentro da busca única do provider, não cada tela por conta própria.
  const { eu } = useEu();

  return (
    <Frame>
      <h1>Marcar na mão</h1>
      {eu ? <FormMarcar eu={eu} /> : <Sub>carregando…</Sub>}
    </Frame>
  );
}
