'use client';
import { useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';
import { painelApi, mensagemDoErro } from '@/lib/api';

export function FormLoginBarbeiro() {
  const [whatsapp, setWhatsapp] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const pronto = whatsapp.trim() && senha && !enviando;

  async function entrar() {
    if (!pronto) return;
    setEnviando(true); setErro('');
    try {
      await painelApi.entrar(whatsapp, senha);
      window.location.href = '/painel';
    } catch (e) {
      // O texto vem pronto da rota. Inventar mensagem aqui faria a resposta
      // deixar de ser uma só, e o formulário voltaria a enumerar a equipe.
      setErro(mensagemDoErro(e));
      setEnviando(false);
    }
  }

  return (
    <>
      <Lbl>entrar</Lbl>
      <Box variante={whatsapp ? 'normal' : 'dash'}>
        {/* "celular ou e-mail", e `inputMode` livre, porque desde a fatia 3
            nem todo mundo entra pelo numero: o barbeiro entra pelo celular, o
            dono pelo e-mail que o admin cadastrou. Dizer so "seu celular"
            mandava o dono digitar o dado errado, e o teclado numerico deixava
            o e-mail quase impossivel de escrever no telefone — que e onde
            estas telas sao usadas. */}
        <input className="w-full outline-none bg-transparent"
               placeholder="seu celular ou e-mail" autoComplete="username"
               value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
      </Box>
      <Box variante={senha ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" type="password"
               placeholder="senha" autoComplete="current-password"
               value={senha} onChange={(e) => setSenha(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && entrar()} />
      </Box>
      {erro && <Sub className="text-acento">{erro}</Sub>}
      <Box variante={pronto ? 'fill' : 'mut'}
           className={pronto ? 'cursor-pointer' : ''} onClick={entrar}>
        {enviando ? 'entrando…' : 'entrar'}
      </Box>
    </>
  );
}
