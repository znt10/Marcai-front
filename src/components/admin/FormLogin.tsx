'use client';
import { useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';
import { adminApi, mensagemDoErro } from '@/lib/api';

export function FormLogin() {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const pronto = usuario.trim() && senha && !enviando;

  async function entrar() {
    if (!pronto) return;
    setEnviando(true); setErro('');
    try {
      await adminApi.entrar(usuario, senha);
      window.location.href = '/admin';
    } catch (e) {
      setErro(mensagemDoErro(e));
      setEnviando(false);
    }
  }

  return (
    <>
      <Lbl>entrar</Lbl>
      <Box variante={usuario ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" placeholder="usuário"
               autoComplete="username"
               value={usuario} onChange={(e) => setUsuario(e.target.value)} />
      </Box>
      <Box variante={senha ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" type="password" placeholder="senha"
               autoComplete="current-password"
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
