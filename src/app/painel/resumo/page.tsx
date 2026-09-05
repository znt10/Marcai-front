import { Frame } from '@/components/wf';
import { Resumo } from '@/components/painel/Resumo';

/// Sem `largo`: são linhas empilhadas, e a 1100px o nome do barbeiro ficaria
/// numa ponta e o número na outra, com um vão de tela no meio. O quadro do
/// dia é largo porque colunas lado a lado são a razão dele existir; aqui não
/// há coluna nenhuma.
///
/// Sem `useEu()` para esconder a tela do barbeiro, ao contrário de
/// `equipe/page.tsx` — de propósito, não esquecimento: a aba já não aparece
/// para ele (`NavPainel`), e quem digita a URL de qualquer forma esbarra no
/// 403 de `resumoApi.ver`, que é a barreira de verdade. Duplicar a guarda
/// aqui só adiantaria o mesmo "Só o dono vê o resumo." por um instante.
export default function ResumoDoPainel() {
  return (
    <Frame>
      <h1>Resumo</h1>
      <Resumo />
    </Frame>
  );
}
