import type { Tipo } from './tipos';

/// Os ícones de quem INSTALA o painel (manifesto no Android, `apple-touch-icon`
/// no iPhone), por tipo (pedido de 28/10/2026): quem trabalha na manicure
/// instala as unhas, e não o poste de barbearia.
///
/// Os do kit são o desenho rosé sobre o fundo nude do tema Rosé, o mesmo tom
/// da tela (`public/icones`). Ícone de tela inicial não pode ser só o desenho
/// sem fundo, como a logo do topo: o sistema pintaria um quadrado branco atrás.
/// O maskable tem o desenho menor, dentro do círculo de 80% que o Android
/// recorta. Barbearia e "outro" seguem com a marca de sempre.
export type IconesDoApp = { p192: string; p512: string; maskable: string; apple: string };

const DE_SEMPRE: IconesDoApp = {
  p192: '/marca.png', p512: '/marca-512.png', maskable: '/marca-maskable.png',
  apple: '/icones/barbearia-apple.png',
};

const doKit = (nome: string): IconesDoApp => ({
  p192: `/icones/${nome}-192.png`, p512: `/icones/${nome}-512.png`,
  maskable: `/icones/${nome}-maskable.png`, apple: `/icones/${nome}-apple.png`,
});

const POR_TIPO: Partial<Record<Tipo, IconesDoApp>> = {
  SOBRANCELHA: doKit('estetica'),
  MANICURE: doKit('manicure'),
  MAQUIAGEM: doKit('maquiagem'),
  CABELEIREIRA: doKit('cabeleireira'),
};

export function iconesDoApp(tipo?: Tipo | null): IconesDoApp {
  return (tipo && POR_TIPO[tipo]) || DE_SEMPRE;
}
