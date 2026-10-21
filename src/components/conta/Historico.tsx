'use client';
import { useState } from 'react';
import { contaApi, mensagemDoErro } from '@/lib/api';
import type { ItemHistorico, Lugar } from '@/lib/api';
import { rotuloDoHorario, rotuloDoStatus, separarHistorico } from '@/lib/conta';
import { vocabulario } from '@/lib/tipos';
import type { Tipo } from '@/lib/tipos';
import { Marca } from '@/components/Marca';
import { LINK } from './estilo';

/// O histórico da conta: um bloco por lugar, "Próximos" e "Anteriores".
export function Historico({ nome, lugares, aoMudar, aoSair }: {
  nome: string; lugares: Lugar[]; aoMudar: () => void; aoSair: () => void;
}) {
  const [erro, setErro] = useState('');
  const [cancelando, setCancelando] = useState<string | null>(null);
  const agora = new Date();
  // Lugar sem nenhum agendamento não aparece.
  const comAgendamento = lugares.filter((l) => l.agendamentos.length > 0);

  async function cancelar(l: Lugar, i: ItemHistorico) {
    if (cancelando || !window.confirm('Cancelar esse horário?')) return;
    setErro(''); setCancelando(i.codigo);
    try {
      await contaApi.cancelar(l.barbeariaId, i.codigo);
      aoMudar();
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setCancelando(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <h1 className="text-[18px] md:text-[22px] font-extrabold text-tinta">Oi, {nome.split(' ')[0]}</h1>
      {erro && <p role="alert" className="text-[12px] md:text-[13px] text-acento">{erro}</p>}

      {comAgendamento.length === 0 && (
        <p className="text-[13.5px] md:text-sm text-lbl">Você ainda não marcou nada por aqui.</p>
      )}

      {comAgendamento.map((l) => {
        const v = vocabulario(l.tipo);
        const { proximos, passados } = separarHistorico(l.agendamentos, agora);
        return (
          <section key={l.barbeariaId}
                   className="rounded-[14px] border border-borda bg-superficie p-4 md:p-5">
            <header className="mb-3 flex items-center gap-2.5">
              <Marca tipo={l.tipo as Tipo} nome={l.nome} tamanho={26} className="rounded-[6px]" />
              <h2 className="min-w-0 truncate text-[14px] md:text-base font-bold text-tinta">
                {v.Lugar} {l.nome}
              </h2>
            </header>
            {proximos.length > 0 && (
              <Lista titulo="Próximos">
                {proximos.map((i) => (
                  <Linha key={i.codigo} i={i}>
                    {i.podeCancelar && (
                      <button type="button" className={LINK} disabled={cancelando === i.codigo}
                              onClick={() => cancelar(l, i)}>
                        {cancelando === i.codigo ? 'Cancelando…' : 'Cancelar'}
                      </button>
                    )}
                  </Linha>
                ))}
              </Lista>
            )}
            {passados.length > 0 && (
              <Lista titulo="Anteriores">
                {passados.map((i) => <Linha key={i.codigo} i={i} status />)}
              </Lista>
            )}
          </section>
        );
      })}

      <button type="button" className={LINK + ' self-start'} onClick={aoSair}>Sair</button>
    </div>
  );
}

function Lista({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <h3 className="mb-1 text-[11px] md:text-xs font-semibold uppercase text-lbl">{titulo}</h3>
      <ul className="divide-y divide-borda">{children}</ul>
    </div>
  );
}

function Linha({ i, status = false, children }: {
  i: ItemHistorico; status?: boolean; children?: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[13.5px] md:text-sm font-semibold text-tinta">{rotuloDoHorario(i.inicio)}</p>
        <p className="truncate text-[12px] md:text-[13px] text-lbl">
          {i.servicoNome} · {i.barbeiroNome}{status && rotuloDoStatus(i.status) && ` · ${rotuloDoStatus(i.status)}`}
        </p>
      </div>
      {children}
    </li>
  );
}
