import type { IconeDeGrupo as Nome } from '@/lib/grupos';

/// Os ícones dos grupos, no mesmo traço fino do painel (`BotaoSeta`).
/// Desenho, e não emoji (decisão de 06/11/2026): emoji muda de celular para
/// celular e sai colorido contra o fundo escuro; o traço pega a cor do tema.
const TRACOS: Record<Nome, React.ReactNode> = {
  tesoura: <><circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8.2 16 19 4M15.8 16 5 4" /></>,
  navalha: <><path d="M4 15 15 4l3 3L7 18z" /><path d="M15 11l6 6-2 2-6-6" /></>,
  pente: <><path d="M3 6h18v4H3z" /><path d="M5 10v9M8.5 10v9M12 10v9M15.5 10v9M19 10v9" /></>,
  secador: <><path d="M4 5h9a4.5 4.5 0 0 1 0 9H4z" /><path d="M8 14l-1 7h3l1-7" /><path d="M18 7.5h3M18 11.5h3" /></>,
  sobrancelha: <><path d="M3 8c3-4 15-4 18 0" /><path d="M4 15c4-4 12-4 16 0-4 4-12 4-16 0z" /><circle cx="12" cy="15" r="1.6" /></>,
  cilios: <><path d="M3 9c4 5 14 5 18 0" /><path d="M6 12.5 4.5 15.5M10 14l-.5 3.2M14 14l.5 3.2M18 12.5l1.5 3" /></>,
  unha: <><path d="M8 21V9a4 4 0 0 1 8 0v12" /><path d="M10 9.5a2 2 0 0 1 4 0V13h-4z" /></>,
  pincel: <><path d="M14 3.5c3-1 6.5 2.5 5.5 5.5L15 12l-3-3z" /><path d="M12 9 4 19.5l1.5 1.5L15 12" /></>,
  cera: <><path d="M5 6h14v3H5z" /><path d="M6 9h12v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" /><path d="M9 14c1.5 1 4.5 1 6 0" /></>,
  gota: <path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" />,
  folha: <><path d="M5 19C5 10 10 5 20 4c-1 10-6 15-15 15z" /><path d="M5 19l8-8" /></>,
  presente: <><path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13" /><path d="M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0" /></>,
  estrela: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  coracao: <path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z" />,
};

export function IconeDeGrupo({ nome, tamanho = 18, className = '' }: {
  nome: string | null; tamanho?: number; className?: string;
}) {
  const traco = nome ? TRACOS[nome as Nome] : null;
  if (!traco) return null;
  return (
    <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} aria-hidden fill="none"
         stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
         className={`shrink-0 ${className}`}>
      {traco}
    </svg>
  );
}
