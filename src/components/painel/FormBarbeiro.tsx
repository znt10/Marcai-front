'use client';
import { useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';
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
      <Lbl>novo na equipe</Lbl>
      <Box variante={nome ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" placeholder="nome"
               value={nome} onChange={(e) => setNome(e.target.value)} />
      </Box>
      <Box variante={whatsapp ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" placeholder="celular"
               inputMode="numeric"
               value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
      </Box>

      <div className="flex gap-2">
        {(['BARBEIRO', 'DONO'] as const).map((p) => (
          <Box key={p} variante={p === papel ? 'fill' : 'normal'}
               className="cursor-pointer" onClick={() => setPapel(p)}>
            {p === 'DONO' ? 'dono' : 'barbeiro'}
          </Box>
        ))}
      </div>

      {erro && <Sub className="text-acento">{erro}</Sub>}
      <Box variante={pronto ? 'fill' : 'mut'}
           className={pronto ? 'cursor-pointer' : ''} onClick={cadastrar}>
        {enviando ? 'cadastrando…' : 'cadastrar e convidar'}
      </Box>

      {link && (
        <Box variante="dash" className="break-all">
          <Lbl>link do convite — mandamos no WhatsApp, e ele só aparece aqui uma vez</Lbl>
          {link}
        </Box>
      )}
      <Lbl>quem entra agora não aparece para o cliente até ter serviço e expediente</Lbl>
    </>
  );
}
