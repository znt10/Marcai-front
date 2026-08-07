'use client';
import { useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';
import { adminApi, mensagemDoErro, type NovaBarbearia } from '@/lib/api';

const CAMPOS = [
  { chave: 'slug',            rotulo: 'slug (vira o subdomínio)' },
  { chave: 'nome',            rotulo: 'nome da barbearia' },
  { chave: 'endereco',        rotulo: 'endereço' },
  { chave: 'horarioResumo',   rotulo: 'horário (ex: seg a sáb, 9h–20h)' },
  { chave: 'whatsappContato', rotulo: 'WhatsApp da barbearia' },
  { chave: 'donoNome',        rotulo: 'nome do dono' },
  { chave: 'donoWhatsapp',    rotulo: 'WhatsApp do dono' },
] as const;

export function FormBarbearia({ aoCriar }: { aoCriar?: () => void }) {
  const [dados, setDados] = useState<Record<string, string>>({});
  const [erro, setErro] = useState('');
  const [link, setLink] = useState('');
  const [enviando, setEnviando] = useState(false);

  const completo = CAMPOS.every((c) => (dados[c.chave] ?? '').trim()) && !enviando;

  async function criar() {
    if (!completo) return;
    setEnviando(true); setErro(''); setLink('');
    try {
      // Os sete campos de CAMPOS são exatamente os de NovaBarbearia, e o
      // botão só habilita com todos preenchidos.
      const criada = await adminApi.criarBarbearia(dados as unknown as NovaBarbearia);
      setLink(criada.linkConvite);
      setDados({});
      aoCriar?.();
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Lbl>nova barbearia</Lbl>
      {CAMPOS.map((c) => (
        <Box key={c.chave} variante={dados[c.chave] ? 'normal' : 'dash'}>
          <input className="w-full outline-none bg-transparent" placeholder={c.rotulo}
                 value={dados[c.chave] ?? ''}
                 onChange={(e) => setDados({ ...dados, [c.chave]: e.target.value })} />
        </Box>
      ))}
      {erro && <Sub className="text-acento">{erro}</Sub>}
      <Box variante={completo ? 'fill' : 'mut'}
           className={completo ? 'cursor-pointer' : ''} onClick={criar}>
        {enviando ? 'criando…' : 'criar barbearia'}
      </Box>
      {link && (
        <Box variante="dash" className="break-all">
          <Lbl>link de convite do dono — só aparece uma vez</Lbl>
          {link}
        </Box>
      )}
    </>
  );
}
