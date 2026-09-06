'use client';
import { Frame } from '@/components/wf';
import { QuadroDoDia } from '@/components/painel/QuadroDoDia';

export default function DiaDoPainel() {
  return (
    // `largo`: é a única tela do painel que ganha com espaço — colunas lado a
    // lado é a razão dela existir.
    <Frame largo>
      <h1>Quadro do dia</h1>
      {/* Todos entram: o dono vê a equipe, o barbeiro vê a própria coluna —
          com o "próximo livre" que a agenda não mostra. */}
      <QuadroDoDia />
    </Frame>
  );
}
