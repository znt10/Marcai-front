'use client';
import Link from 'next/link';
import { useState } from 'react';
import { contaApi, mensagemDoErro } from '@/lib/api';
import { SENHA_MINIMA_CONTA } from '@/lib/conta';
import { BOTAO, CAMPO, LINK } from './estilo';

/// A senha nova que o link do WhatsApp leva a criar (padrão de `DefinirSenha`).
export function NovaSenha({ token }: { token: string }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [pronto, setPronto] = useState(false);
  const valida = senha.length >= SENHA_MINIMA_CONTA;

  async function salvar() {
    if (!valida || ocupado) return;
    setErro(''); setOcupado(true);
    try {
      await contaApi.novaSenha(token, senha);
      setPronto(true);
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setOcupado(false);
    }
  }

  if (pronto) {
    return (
      <section className="mx-auto flex w-full max-w-[420px] flex-col gap-4">
        <p className="text-[14px] md:text-[15px] font-semibold text-tinta">
          Senha nova criada. Você já está logado.
        </p>
        <Link href="/conta" className={LINK + ' self-start'}>Ver meus horários</Link>
      </section>
    );
  }

  return (
    <form className="mx-auto flex w-full max-w-[420px] flex-col gap-4"
          onSubmit={(e) => { e.preventDefault(); salvar(); }}>
      <div>
        <h1 className="text-[18px] md:text-[22px] font-extrabold text-tinta">Senha nova</h1>
        <p className="mt-1 text-[12.5px] md:text-[13.5px] text-lbl">
          Escolhe uma senha de pelo menos {SENHA_MINIMA_CONTA} caracteres.
        </p>
      </div>
      <input className={CAMPO} type="password" autoComplete="new-password" placeholder="Senha nova"
             aria-label="Senha nova" value={senha} onChange={(e) => setSenha(e.target.value)} />
      {erro && <p role="alert" className="text-[12px] md:text-[13px] text-acento">{erro}</p>}
      <button type="submit" className={BOTAO} disabled={!valida || ocupado}>Criar senha</button>
    </form>
  );
}
