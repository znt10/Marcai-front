import type { Metadata } from 'next';
import { Big_Shoulders, Archivo, Space_Mono } from 'next/font/google';
import './globals.css';

/// Três faces, três trabalhos — expostas como variáveis CSS para que os
/// primitivos de @/components/wf as usem sem importar next/font.

/// Letreiro condensado, caixa alta: títulos e o botão que conclui.
/// Big Shoulders no lugar do Oswald de sempre — mesma família de letreiro,
/// sem ser a que já está em todo lugar.
const letreiro = Big_Shoulders({
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
    <html lang="pt-BR" className={`${letreiro.variable} ${corpo.variable} ${dado.variable}`}>
      <body>{children}</body>
    </html>
  );
}
