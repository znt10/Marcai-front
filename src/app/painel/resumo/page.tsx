import { Frame } from '@/components/wf';
import { Resumo } from '@/components/painel/Resumo';

/// Sem `largo`: são linhas empilhadas, e a 1100px o nome do barbeiro ficaria
/// numa ponta e o número na outra, com um vão de tela no meio. O quadro do
/// dia é largo porque colunas lado a lado são a razão dele existir; aqui não
/// há coluna nenhuma.
export default function ResumoDoPainel() {
  return (
    <Frame>
      <h1>Resumo</h1>
      <Resumo />
    </Frame>
  );
}
