'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';
import { publicoApi, mensagemDoErro } from '@/lib/api';

const MINIMO = 8;

export function DefinirSenha({ token }: { token: string }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState(false);

  const valida = senha.length >= MINIMO;

  async function salvar() {
    if (!valida) return;
    setErro('');
    try {
      await publicoApi.definirSenha(token, senha);
      setPronto(true);
    } catch (e) {
      setErro(mensagemDoErro(e));
    }
  }

  if (pronto) {
    return (
      <>
        <Sub>Senha criada. Já dá pra entrar no painel.</Sub>
        <Link href="/painel"><Box variante="fill">ir para o painel</Box></Link>
      </>
    );
  }

  return (
    <>
      <Sub>escolhe uma senha de ao menos {MINIMO} caracteres</Sub>
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
