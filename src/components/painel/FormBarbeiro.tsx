'use client';
import { useState } from 'react';
import { Cartao, Pilula, BotaoCheio, Titulo, Texto } from '@/components/painel/pecas';
import { equipeApi, mensagemDoErro, type NovoBarbeiro } from '@/lib/api';

export function FormBarbeiro({ aoCriar }: { aoCriar?: () => void }) {
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [papel, setPapel] = useState<NovoBarbeiro['papel']>('BARBEIRO');
  const [erro, setErro] = useState('');
  const [link, setLink] = useState('');
  const [enviando, setEnviando] = useState(false);

  const pronto = nome.trim().length >= 2 && whatsapp.trim() && !enviando;

  async function cadastrar() {
    if (!pronto) return;
    setEnviando(true); setErro(''); setLink('');
    try {
      const { linkConvite } = await equipeApi.cadastrar({ nome, whatsapp, papel });
      // O link aparece aqui E vai pelo WhatsApp. Duas vias porque o envio é
      // fire-and-forget: API fora do ar não pode deixar o barbeiro sem convite.
      setLink(linkConvite);
      setNome(''); setWhatsapp(''); setPapel('BARBEIRO');
      aoCriar?.();
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Titulo>Novo na equipe</Titulo>
      <Cartao variante={nome ? 'normal' : 'dash'}>
        <input className="w-full bg-transparent text-[13.5px] font-medium outline-none
                          placeholder:text-lbl"
               placeholder="nome"
               value={nome} onChange={(e) => setNome(e.target.value)} />
      </Cartao>
      <Cartao variante={whatsapp ? 'normal' : 'dash'}>
        <input className="w-full bg-transparent text-[13.5px] font-medium outline-none
                          placeholder:text-lbl"
               placeholder="celular" inputMode="numeric"
               value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
      </Cartao>

      <div className="flex gap-2">
        {(['DONO', 'BARBEIRO'] as const).map((p) => (
          <Pilula key={p} ativo={p === papel} onClick={() => setPapel(p)}>
            {p === 'DONO' ? 'dono' : 'barbeiro'}
          </Pilula>
        ))}
      </div>

      {erro && <Texto className="text-acento">{erro}</Texto>}
      <BotaoCheio className="self-start" disabled={!pronto} onClick={cadastrar}>
        {enviando ? 'cadastrando…' : 'cadastrar e convidar'}
      </BotaoCheio>

      {link && (
        <Cartao className="flex flex-col gap-1 break-all">
          <Texto>link do convite — mandamos no WhatsApp, e ele só aparece aqui uma vez</Texto>
          <span className="font-dado text-[11px] text-sub">{link}</span>
        </Cartao>
      )}
      <Texto>
        Quem entra agora não aparece para o cliente até ter serviço e
        expediente.
      </Texto>
    </>
  );
}
