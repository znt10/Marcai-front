import type { Metadata } from 'next';
import { Architects_Daughter } from 'next/font/google';
import './globals.css';

/// A fonte manuscrita do wireframe. Exposta como variável CSS para que os
/// primitivos de @/components/wf a apliquem sem importar next/font.
const mao = Architects_Daughter({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-mao',
  display: 'swap',
});

export const metadata: Metadata = { title: 'Agendamento' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className={mao.variable}>
      <body>{children}</body>
    </html>
  );
}
