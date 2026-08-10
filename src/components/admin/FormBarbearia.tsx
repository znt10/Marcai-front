'use client';
import { useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';
import { adminApi, mensagemDoErro, type NovaBarbearia } from '@/lib/api';

/// Cinco campos, e os dois que saíram têm motivos diferentes.
///
/// **Horário** saiu porque o admin não sabe o horário da barbearia. Pedir era
/// pedir para ele inventar um valor — e o dono já tem a tela para escrever a
/// frase da home.
///
/// **WhatsApp do dono** saiu porque no cadastro é a mesma pessoa do contato da
/// barbearia: eram dois campos para digitar o mesmo número. O número da
/// barbearia vira o login do dono, e ele separa depois pela tela de equipe.
const CAMPOS = [
  { chave: 'slug',            rotulo: 'slug (vira o subdomínio)' },
  { chave: 'nome',            rotulo: 'nome da barbearia' },
  { chave: 'endereco',        rotulo: 'endereço' },
  { chave: 'whatsappContato', rotulo: 'WhatsApp da barbearia' },
  { chave: 'donoNome',        rotulo: 'nome do dono' },
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
      // Os cinco campos de CAMPOS são exatamente os de NovaBarbearia, e o
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
        <>
          <Box variante="copia" className="break-all">
            <Sub>link de convite do dono — só aparece uma vez</Sub>
            {link}
          </Box>
          {/* Duas vias: a tela mostra uma vez e o zap guarda. Dizer isso aqui
              importa porque muda o que o admin faz — não precisa copiar o link
              correndo com medo de perder. */}
          <Sub>mandamos esse link no WhatsApp da barbearia também</Sub>
        </>
      )}
    </>
  );
}
