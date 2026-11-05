'use client';
import { useRef } from 'react';
import { Cartao, BotaoVazado, Texto, Titulo } from '@/components/painel/pecas';
import { Avatar } from '@/components/wf';
import { useEu } from '@/components/painel/SessaoDoPainel';
import { useTrocarMinhaFoto } from '@/components/painel/useTrocarMinhaFoto';

/// "Sua foto", ao lado da logo no alto da Equipe (spec 2026-11-05). A MESMA
/// foto do botão do cabeçalho, pelo mesmo hook: trocar aqui troca lá. Cada
/// um põe a própria foto — o dono não mexe na dos outros (José, 05/11).
export function SuaFoto() {
  const { eu } = useEu();
  const { trocar, tirar, erro } = useTrocarMinhaFoto();
  const seletor = useRef<HTMLInputElement>(null);
  if (!eu) return null;

  return (
    <Cartao className="flex flex-col gap-3">
      <Titulo>Sua foto</Titulo>
      <div className="flex h-[120px] items-center justify-center">
        <Avatar tamanho={96} fotoUrl={eu.fotoUrl} nome={eu.nome} />
      </div>
      <Texto>Aparece na hora de escolher com quem marcar.</Texto>
      <input ref={seletor} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
             onChange={(e) => { void trocar(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="flex gap-2">
        <BotaoVazado onClick={() => seletor.current?.click()}>
          {eu.fotoUrl ? 'trocar' : 'pôr foto'}
        </BotaoVazado>
        {eu.fotoUrl && <BotaoVazado onClick={() => void tirar()}>tirar</BotaoVazado>}
      </div>
      {erro && <Texto className="!text-acento">{erro}</Texto>}
    </Cartao>
  );
}
