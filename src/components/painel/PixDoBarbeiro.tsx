'use client';
import { useEffect, useState } from 'react';
import { BotaoCheio, Cartao, Interruptor, Texto, Etiqueta } from '@/components/painel/pecas';
import {
  ErroApi, ignorarAborto, mensagemDoErro, meuPixApi, type MeuPix,
} from '@/lib/api';
import {
  TIPOS_DE_CHAVE, TITULAR_MAX, corpoParaSalvar, validarPixDoBarbeiro, type FormPix,
} from '@/lib/pix';

const doBack = (p: MeuPix): FormPix => ({
  cobra: p.cobraNoAgendamento, tipo: p.pixTipo, chave: p.pixChave, titular: p.pixTitular,
});

/// Os serviços sem preço que o back devolve num 400 ao tentar ligar.
function semPrecoDoErro(e: unknown): string[] {
  if (!(e instanceof ErroApi)) return [];
  const lista = (e.corpo as { servicosSemPreco?: unknown } | undefined)?.servicosSemPreco;
  return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [];
}

/// "Cobrar Pix ao agendar" + a chave do próprio barbeiro. Ligado, o cliente
/// paga logo depois de marcar; desligado, paga no local.
export function PixDoBarbeiro() {
  const [salvo, setSalvo] = useState<MeuPix | null>(null);
  const [f, setF] = useState<FormPix | null>(null);
  const [erro, setErro] = useState('');
  const [semPreco, setSemPreco] = useState<string[]>([]);
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    meuPixApi.ver(ctrl.signal)
      .then((p) => { setSalvo(p); setF(doBack(p)); setSemPreco(p.servicosSemPreco); })
      .catch((e) => { ignorarAborto(e); setErro(mensagemDoErro(e)); });
    return () => ctrl.abort();
  }, []);

  if (!salvo || !f) return erro ? <Texto className="text-acento">{erro}</Texto> : <Texto>carregando…</Texto>;

  function aceitar(p: MeuPix, texto: string) {
    setSalvo(p); setF(doBack(p)); setSemPreco(p.servicosSemPreco); setAviso(texto);
  }

  async function chamar(corpo: Parameters<typeof meuPixApi.salvar>[0], texto: string) {
    setErro(''); setAviso(''); setOcupado(true);
    try {
      aceitar(await meuPixApi.salvar(corpo), texto);
    } catch (e) {
      setErro(mensagemDoErro(e));
      setSemPreco(semPrecoDoErro(e));
    } finally {
      setOcupado(false);
    }
  }

  // Desligar manda só o interruptor: é sempre livre, e o que estiver pela
  // metade nos campos não pode derrubar o pedido.
  const mexerNoInterruptor = () => {
    if (!f) return;
    if (f.cobra) {
      void chamar({ cobraNoAgendamento: false }, 'Desligado. O cliente paga no local.');
      return;
    }
    const invalido = validarPixDoBarbeiro({ ...f, cobra: true });
    if (invalido) { setErro(invalido); setAviso(''); return; }
    void chamar(corpoParaSalvar({ ...f, cobra: true }), 'Ligado. O cliente paga o Pix ao agendar.');
  };

  const salvar = () => {
    if (!f) return;
    const invalido = validarPixDoBarbeiro(f);
    if (invalido) { setErro(invalido); setAviso(''); return; }
    void chamar(corpoParaSalvar(f), 'Salvo.');
  };

  const mudou = JSON.stringify(f) !== JSON.stringify(doBack(salvo));
  const mexer = (parte: Partial<FormPix>) => { setF({ ...f, ...parte }); setAviso(''); };

  return (
    <>
      <Cartao className="flex items-center justify-between gap-3">
        <span className="flex flex-col gap-0.5">
          <span className="text-[15px] font-bold text-tinta">Cobrar Pix ao agendar</span>
          <Texto>{salvo.cobraNoAgendamento
            ? 'Ligado: o cliente paga o Pix logo depois de marcar.'
            : 'Desligado: o cliente paga no local.'}</Texto>
        </span>
        <Interruptor ligado={salvo.cobraNoAgendamento} rotulo="Cobrar Pix ao agendar"
                     disabled={ocupado} onClick={mexerNoInterruptor} />
      </Cartao>

      <Cartao className="flex flex-col gap-3">
        <Etiqueta>tipo da chave</Etiqueta>
        <select aria-label="Tipo da chave Pix" value={f.tipo}
                onChange={(e) => mexer({ tipo: e.target.value as FormPix['tipo'] })}
                className="rounded-[10px] border border-borda bg-transparent px-3 py-2.5 text-tinta">
          <option value="">Escolha…</option>
          {TIPOS_DE_CHAVE.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
        </select>

        <Etiqueta>chave Pix</Etiqueta>
        <input aria-label="Chave Pix" value={f.chave} onChange={(e) => mexer({ chave: e.target.value })}
               autoComplete="off" inputMode={f.tipo === 'EMAIL' ? 'email' : 'text'}
               className="rounded-[10px] border border-borda bg-transparent px-3 py-2.5 font-dado text-tinta" />

        <Etiqueta>titular</Etiqueta>
        <input aria-label="Nome do titular" value={f.titular} maxLength={TITULAR_MAX}
               onChange={(e) => mexer({ titular: e.target.value })}
               className="rounded-[10px] border border-borda bg-transparent px-3 py-2.5 text-tinta" />
        <Texto>O nome que aparece no Pix do cliente, como está no seu banco.</Texto>

        <BotaoCheio onClick={salvar} disabled={!mudou || ocupado}>
          {ocupado ? 'Salvando…' : 'Salvar'}
        </BotaoCheio>
      </Cartao>

      {erro && <div role="alert"><Texto className="text-acento">{erro}</Texto></div>}
      {aviso && !erro && <Texto>{aviso}</Texto>}
      {semPreco.length > 0 && (
        <Cartao variante="dash" role="status">
          <Texto>
            Para cobrar ao agendar, todo serviço seu precisa de preço. Sem preço:{' '}
            <b>{semPreco.join(', ')}</b>.
          </Texto>
        </Cartao>
      )}
    </>
  );
}
