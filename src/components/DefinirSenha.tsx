'use client';
import { useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';

const MINIMO = 8;

export function DefinirSenha({ token }: { token: string }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState(false);

  const valida = senha.length >= MINIMO;

  async function salvar() {
    if (!valida) return;
    setErro('');
    const r = await fetch(`/api/auth/convite/${token}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ senha }),
    });
    if (r.ok) { setPronto(true); return; }
    setErro((await r.json()).erro);
  }

  if (pronto) {
    return (
      <>
        <Sub>Senha criada. Já dá pra entrar no painel.</Sub>
        <a href="/painel"><Box variante="fill">ir para o painel</Box></a>
      </>
    );
  }

  return (
    <>
      <Lbl>escolhe uma senha de ao menos {MINIMO} caracteres</Lbl>
      <Box variante={senha ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" type="password" placeholder="senha"
               autoComplete="new-password"
               value={senha} onChange={(e) => setSenha(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && salvar()} />
      </Box>
      {erro && <Sub className="text-acento">{erro}</Sub>}
      <Box variante={valida ? 'fill' : 'mut'}
           className={valida ? 'cursor-pointer' : ''} onClick={salvar}>
        criar senha
      </Box>
    </>
  );
}
