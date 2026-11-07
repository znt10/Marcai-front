'use client';
import { useState } from 'react';
import { Cartao, BotaoCheio, BotaoVazado, Texto, Etiqueta } from '@/components/painel/pecas';
import { IconeDeGrupo } from '@/components/IconeDeGrupo';
import { ICONES_DE_GRUPO, type GrupoDeServico } from '@/lib/grupos';

/// As peças da tela de Serviços que mexem nos grupos (06/11/2026). Só o dono
/// as vê; quem garante as regras é o back, aqui só se evita o pedido inútil.

/// A grade de ícones. O primeiro quadrado é "sem ícone": o grupo aparece só
/// com o nome.
export function GradeDeIcones({ valor, aoEscolher }: {
  valor: string | null; aoEscolher: (icone: string | null) => void;
}) {
  const quadrado = (ativo: boolean) =>
    `grid size-10 place-items-center rounded-[10px] border transition-colors
     ${ativo ? 'border-acento bg-superficie2 text-acento' : 'border-borda-suave text-sub hover:border-acento'}`;
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Ícone do grupo">
      <button type="button" role="radio" aria-checked={valor === null}
              className={`${quadrado(valor === null)} text-[10px] font-semibold`}
              onClick={() => aoEscolher(null)}>
        sem
      </button>
      {ICONES_DE_GRUPO.map((nome) => (
        <button key={nome} type="button" role="radio" aria-checked={valor === nome}
                aria-label={nome} className={quadrado(valor === nome)}
                onClick={() => aoEscolher(nome)}>
          <IconeDeGrupo nome={nome} tamanho={20} />
        </button>
      ))}
    </div>
  );
}

/// Nome e ícone — o mesmo formulário para criar e para editar.
export function FormDoGrupo({ inicial, rotulo, aoSalvar, aoCancelar }: {
  inicial?: { nome: string; icone: string | null };
  rotulo: string;
  aoSalvar: (d: { nome: string; icone: string | null }) => void;
  aoCancelar?: () => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [icone, setIcone] = useState<string | null>(inicial?.icone ?? null);
  const valido = nome.trim().length >= 2;
  return (
    <div className="flex flex-col gap-2.5">
      <Cartao variante={nome ? 'normal' : 'dash'}>
        <input className="w-full bg-transparent text-[13.5px] font-medium outline-none placeholder:text-lbl"
               maxLength={30} placeholder="nome do grupo — ex.: Cabelo, Combos"
               value={nome} onChange={(e) => setNome(e.target.value)} />
      </Cartao>
      <Etiqueta>ícone</Etiqueta>
      <GradeDeIcones valor={icone} aoEscolher={setIcone} />
      <div className="flex gap-2">
        <BotaoCheio largura={aoCancelar ? 'natural' : 'cheia'} disabled={!valido}
                    onClick={() => {
                      if (!valido) return;
                      aoSalvar({ nome: nome.trim(), icone });
                      if (!inicial) { setNome(''); setIcone(null); }
                    }}>
          {rotulo}
        </BotaoCheio>
        {aoCancelar && <BotaoVazado onClick={aoCancelar}>cancelar</BotaoVazado>}
      </div>
    </div>
  );
}

/// Apagar um grupo. Com serviços dentro e outros grupos na casa, pergunta
/// para onde eles vão; sendo o último, avisa que a lista volta a ser solta.
export function ApagarGrupo({ grupo, outros, quantidade, aoApagar, aoCancelar }: {
  grupo: GrupoDeServico; outros: GrupoDeServico[]; quantidade: number;
  aoApagar: (moverPara?: string) => void; aoCancelar: () => void;
}) {
  const [destino, setDestino] = useState(outros[0]?.id ?? '');
  const precisaDestino = quantidade > 0 && outros.length > 0;
  return (
    <Cartao variante="mut" className="flex flex-col gap-2.5">
      {outros.length === 0 ? (
        <Texto>
          É o último grupo: apagando, os serviços voltam para a lista solta, sem grupos.
        </Texto>
      ) : precisaDestino ? (
        <label className="flex flex-col gap-1">
          <Texto>
            {quantidade === 1 ? 'O serviço' : `Os ${quantidade} serviços`} de {grupo.nome} vão para:
          </Texto>
          <select className="rounded-[10px] border border-borda bg-superficie px-3 py-2 text-[13px] text-tinta"
                  value={destino} onChange={(e) => setDestino(e.target.value)}>
            {outros.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
          </select>
        </label>
      ) : (
        <Texto>O grupo está vazio.</Texto>
      )}
      <div className="flex gap-2">
        {/* Destino vai sempre que há outro grupo: o back conta também os
            desativados, que esta tela não soma em `quantidade`. */}
        <BotaoCheio onClick={() => aoApagar(outros.length > 0 ? destino : undefined)}>
          apagar {grupo.nome}
        </BotaoCheio>
        <BotaoVazado onClick={aoCancelar}>cancelar</BotaoVazado>
      </div>
    </Cartao>
  );
}

/// O seletor de grupo de um serviço (mover de um grupo para outro).
export function SeletorDeGrupo({ grupos, valor, aoMudar }: {
  grupos: GrupoDeServico[]; valor: string; aoMudar: (id: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <Etiqueta>grupo</Etiqueta>
      <select className="min-w-0 rounded-[10px] border border-borda-suave bg-superficie px-2.5 py-1.5
                         text-[12.5px] text-tinta"
              value={valor} onChange={(e) => aoMudar(e.target.value)}>
        {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
      </select>
    </label>
  );
}
