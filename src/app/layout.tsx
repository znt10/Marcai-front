import type { Metadata } from 'next';
import { Poppins, Archivo, Space_Mono } from 'next/font/google';
import './globals.css';
import { SCRIPT_DO_TEMA } from '@/components/painel/Tema';

/// Três faces, três trabalhos — expostas como variáveis CSS para que os
/// primitivos de @/components/wf as usem sem importar next/font.

/// Títulos e o botão que conclui.
///
/// Era Big Shoulders, condensada e em caixa alta — uma face desenhada para
/// gritar de longe, num letreiro de fachada. O redesign do painel troca isso
/// por uma geométrica pesada em caixa MISTA: o título agora é lido de perto,
/// na mão, como cabeçalho de tela e não como placa.
///
/// Vem com pesos explícitos porque a Poppins não é variável: cada peso é um
/// arquivo. São os seis que o produto usa — 900 no título de tela e na marca
/// do painel, 800 nos títulos do resto, 700 e 600 nos nomes, abas e botões,
/// 500 no corpo do painel, 400 no resto.
const letreiro = Poppins({
  weight: ['400', '500', '600', '700', '800', '900'],
  subsets: ['latin'], variable: '--fonte-letreiro', display: 'swap',
});

const corpo = Archivo({
  subsets: ['latin'], variable: '--fonte-corpo', display: 'swap',
});

/// A face que justifica as outras duas: este app é sobre TEMPO. A tela do
/// cliente é uma lista de horas e o quadro do dia é uma coluna de horas por
/// barbeiro — com fonte proporcional, `09:00` e `14:30` não alinham e a
/// varredura vertical, que é a razão daquela tela, se perde.
const dado = Space_Mono({
  weight: ['400', '700'], subsets: ['latin'], variable: '--fonte-dado', display: 'swap',
});

export const metadata: Metadata = { title: 'Agendamento' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // `suppressHydrationWarning` no `<html>`, e só nele: o script abaixo
    // escreve `data-tema` neste elemento ANTES de o React hidratar, então o
    // atributo que veio do servidor e o que está no navegador diferem de
    // propósito — é exatamente o que evita o pisca. Sem esta marca o React
    // reclama de uma diferença que é o desenho funcionando. Ela não desce
    // para os filhos: qualquer outra divergência continua sendo avisada.
    <html lang="pt-BR" suppressHydrationWarning
          className={`${letreiro.variable} ${corpo.variable} ${dado.variable}`}>
      <body>
        {/* Antes de qualquer pintura: escreve no `<html>` o tema que a pessoa
            escolheu no painel, para a tela não nascer escura e clarear no
            quadro seguinte. Ver `Tema.tsx`.

            No topo do `<body>`, e não num `<head>` escrito à mão: a
            documentação desta versão do Next pede que o `<head>` do layout
            raiz fique com a Metadata API. Aqui ele roda enquanto o HTML é
            lido, que é antes da hidratação — que é o que importa. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DO_TEMA }} />
        {children}
      </body>
    </html>
  );
}
