'use client';
import { useId } from 'react';
import { IconeDeGrupo } from '@/components/IconeDeGrupo';
import type { GrupoDeServico } from '@/lib/grupos';

/// A faixa de um grupo que abre e fecha (o desenho do print de 06/11/2026):
/// ícone e nome à esquerda, quantidade e setinha à direita.
///
/// Controlada por fora (`aberta`/`alternar`): quem usa decide a regra de
/// abertura (fechadas no agendar, a do serviço escolhido aberta na volta do
/// calendário). `resumo` aparece no lugar da quantidade quando a gaveta está
/// fechada — é onde o cliente vê o serviço que já escolheu ali dentro.
export function Gaveta({
  grupo, quantidade, aberta, alternar, resumo, acoes, children,
}: {
  grupo: GrupoDeServico; quantidade: number; aberta: boolean; alternar: () => void;
  resumo?: React.ReactNode; acoes?: React.ReactNode; children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className={`rounded-[16px] border bg-superficie transition-colors
                     ${aberta ? 'border-borda' : 'border-borda-suave'}`}>
      <div className="flex items-center gap-2 pr-2">
        <button type="button" onClick={alternar} aria-expanded={aberta} aria-controls={id}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-4 py-3.5 text-left">
          <IconeDeGrupo nome={grupo.icone} className="text-acento" />
          <span className="min-w-0 truncate text-[14.5px] font-bold text-tinta">{grupo.nome}</span>
          <span className="ml-auto flex shrink-0 items-center gap-2.5">
            {!aberta && resumo
              ? <span className="max-w-[45vw] truncate text-[11.5px] font-semibold text-acento">{resumo}</span>
              : <span className="font-dado text-[11.5px] text-lbl">{quantidade}</span>}
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden fill="none"
                 stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                 className={`text-lbl transition-transform ${aberta ? 'rotate-180' : ''}`}>
              <path d="M4 6l4 4 4-4" />
            </svg>
          </span>
        </button>
        {acoes}
      </div>
      {aberta && <div id={id} className="flex flex-col gap-2 px-3 pb-3">{children}</div>}
    </div>
  );
}
