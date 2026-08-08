import { NextResponse } from 'next/server';
import { filtroDoBarbeiro } from './autorizacao';
import type { Sessao } from './auth';

/// Alcance das rotas de horário: **dono mexe no de todos, barbeiro no seu**.
/// Diferente da equipe, que é `ehDono` puro — lá se decide quem é da casa,
/// aqui quando cada um trabalha, e isso começa na pessoa.
///
/// Devolve `null` quando o barbeiro pede o id de um colega, e a rota responde
/// **404**: é registro alheio, e o status não pode confirmar que ele existe.
export function alvoDoBarbeiro(sessao: Sessao, pedido: string | null | undefined): string | null {
  const filtro = filtroDoBarbeiro(sessao);
  if (!filtro.barbeiroId) return pedido || sessao.sub;   // dono
  if (pedido && pedido !== sessao.sub) return null;      // barbeiro pedindo o do colega
  return sessao.sub;
}

export const NAO_ENCONTRADO = NextResponse.json(
  { erro: 'Não encontrado.' }, { status: 404 });
