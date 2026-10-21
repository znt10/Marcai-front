'use client';
import { useEffect, useState } from 'react';
import { contaApi, mensagemDoErro } from '@/lib/api';
import { codigoValido, SENHA_MINIMA_CONTA } from '@/lib/conta';
import { formatar, normalizar } from '@/lib/telefone';
import { BOTAO, CAMPO, LINK } from './estilo';

type Etapa = 'entrar' | 'criar' | 'confirmar' | 'esqueci' | 'enviado';

const ESPERA_REENVIO_S = 30;

/// Entrar / criar / confirmar / esqueci, uma etapa por vez.
///
/// A senha digitada em "criar" fica só neste estado e vai de novo em
/// "confirmar" (o back só cria a conta quando o código bate). Nunca vai para
/// storage nem para a URL.
export function PortaDaConta({ aoEntrar }: { aoEntrar: () => void }) {
  const [etapa, setEtapa] = useState<Etapa>('entrar');
  const [nome, setNome] = useState('');
  const [whats, setWhats] = useState('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [espera, setEspera] = useState(0);

  // Contagem do "reenviar código".
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const digitos = normalizar(whats);

  function ir(e: Etapa) { setEtapa(e); setErro(''); setAviso(''); }

  async function rodar(fn: () => Promise<void>) {
    if (ocupado) return;
    setOcupado(true); setErro(''); setAviso('');
    try { await fn(); } catch (e) { setErro(mensagemDoErro(e)); } finally { setOcupado(false); }
  }

  const entrar = () => rodar(async () => {
    await contaApi.entrar(digitos!, senha);
    aoEntrar();
  });

  const criar = () => rodar(async () => {
    await contaApi.criar({ nome: nome.trim(), whatsapp: digitos!, senha });
    setCodigo(''); setEspera(ESPERA_REENVIO_S);
    ir('confirmar');
  });

  const confirmar = () => rodar(async () => {
    await contaApi.confirmar(digitos!, codigo, senha);
    aoEntrar();
  });

  const reenviar = () => rodar(async () => {
    await contaApi.reenviar(digitos!);
    setEspera(ESPERA_REENVIO_S);
    setAviso('Mandamos um código novo.');
  });

  // A resposta é a mesma exista a conta ou não: quem pergunta não descobre
  // quais números têm conta.
  const esqueci = () => rodar(async () => {
    try { await contaApi.esqueci(digitos!); } catch { /* o texto é o mesmo */ }
    ir('enviado');
  });

  const campoWhats = (
    <Campo rotulo="WhatsApp">
      <input className={CAMPO} inputMode="numeric" autoComplete="tel" placeholder="(11) 9 ____-____"
             value={whats}
             onChange={(e) => {
               const d = e.target.value.replace(/\D/g, '').slice(0, 11);
               setWhats(d.length >= 10 ? formatar(d) : d);
             }} />
    </Campo>
  );
  const Erro = erro ? <p role="alert" className="text-[12px] md:text-[13px] text-acento">{erro}</p> : null;
  const Aviso = aviso ? <p className="text-[12px] md:text-[13px] text-lbl">{aviso}</p> : null;

  if (etapa === 'enviado') {
    return (
      <Bloco titulo="Esqueci a senha">
        <p className="text-[13.5px] md:text-sm text-tinta">
          Se esse WhatsApp tiver conta, mandamos um link pra lá.
        </p>
        <button type="button" className={LINK + ' self-start'} onClick={() => ir('entrar')}>
          Voltar pra entrar
        </button>
      </Bloco>
    );
  }

  if (etapa === 'esqueci') {
    return (
      <Bloco titulo="Esqueci a senha"
             sub="Digita seu WhatsApp que a gente manda um link pra criar uma senha nova.">
        <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); if (digitos) esqueci(); }}>
          {campoWhats}
          {Erro}
          <button type="submit" className={BOTAO} disabled={!digitos || ocupado}>Mandar o link</button>
        </form>
        <button type="button" className={LINK + ' self-start'} onClick={() => ir('entrar')}>Voltar</button>
      </Bloco>
    );
  }

  if (etapa === 'confirmar') {
    return (
      <Bloco titulo="Confirmar o WhatsApp"
             sub={`Mandamos um código de 6 dígitos pro ${whats}. Vale por 10 minutos.`}>
        <form className="flex flex-col gap-3.5"
              onSubmit={(e) => { e.preventDefault(); if (codigoValido(codigo)) confirmar(); }}>
          <Campo rotulo="Código">
            <input className={CAMPO + ' font-dado tracking-[0.3em]'} inputMode="numeric"
                   autoComplete="one-time-code" placeholder="000000" maxLength={6}
                   value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          </Campo>
          {Erro}{Aviso}
          <button type="submit" className={BOTAO} disabled={!codigoValido(codigo) || ocupado}>
            Confirmar
          </button>
        </form>
        <div className="flex items-center justify-between">
          <button type="button" className={LINK} disabled={espera > 0 || ocupado} onClick={reenviar}>
            {espera > 0 ? `Reenviar código em ${espera}s` : 'Reenviar código'}
          </button>
          <button type="button" className={LINK} onClick={() => ir('criar')}>Voltar</button>
        </div>
      </Bloco>
    );
  }

  if (etapa === 'criar') {
    const ok = nome.trim().length >= 2 && !!digitos && senha.length >= SENHA_MINIMA_CONTA;
    return (
      <Bloco titulo="Criar conta"
             sub="Pra ver seus horários e cancelar sem procurar o link. É opcional: dá pra marcar sem conta.">
        <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); if (ok) criar(); }}>
          <Campo rotulo="Seu nome">
            <input className={CAMPO} autoComplete="name" placeholder="Seu nome"
                   value={nome} onChange={(e) => setNome(e.target.value)} />
          </Campo>
          {campoWhats}
          <Campo rotulo={`Senha (mínimo ${SENHA_MINIMA_CONTA} caracteres)`}>
            <input className={CAMPO} type="password" autoComplete="new-password" placeholder="Senha"
                   value={senha} onChange={(e) => setSenha(e.target.value)} />
          </Campo>
          {Erro}
          <button type="submit" className={BOTAO} disabled={!ok || ocupado}>Criar conta</button>
        </form>
        <p className="text-[12.5px] md:text-[13px] text-lbl">
          Já tem conta?{' '}
          <button type="button" className={LINK} onClick={() => ir('entrar')}>Entrar</button>
        </p>
      </Bloco>
    );
  }

  const ok = !!digitos && senha.length > 0;
  return (
    <Bloco titulo="Entrar" sub="Veja seus horários em todo lugar onde você marcou.">
      <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); if (ok) entrar(); }}>
        {campoWhats}
        <Campo rotulo="Senha">
          <input className={CAMPO} type="password" autoComplete="current-password" placeholder="Senha"
                 value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        {Erro}
        <button type="submit" className={BOTAO} disabled={!ok || ocupado}>Entrar</button>
      </form>
      <div className="flex items-center justify-between">
        <button type="button" className={LINK} onClick={() => ir('criar')}>Criar conta</button>
        <button type="button" className={LINK} onClick={() => ir('esqueci')}>Esqueci a senha</button>
      </div>
    </Bloco>
  );
}

function Bloco({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto flex w-full max-w-[420px] flex-col gap-4">
      <div>
        <h1 className="text-[18px] md:text-[22px] font-extrabold text-tinta">{titulo}</h1>
        {sub && <p className="mt-1 text-[12.5px] md:text-[13.5px] text-lbl">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] md:text-xs font-semibold uppercase text-lbl">{rotulo}</span>
      {children}
    </label>
  );
}
