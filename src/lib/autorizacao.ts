import type { Sessao } from './auth';

/// O ÚNICO lugar onde o alcance do barbeiro é decidido. Nenhuma consulta do
/// painel monta este filtro por fora — a garantia "só o que é dele" vale
/// exatamente enquanto isso for verdade.
///
/// Por que isto não foi para o RLS, sendo que o tenant foi: a área pública
/// precisa ler a ocupação de TODOS os barbeiros para calcular horário livre
/// (cliente §6.3). Uma política que restringisse ao próprio barbeiro quebraria
/// o fluxo do cliente. Tenant no banco, barbeiro na aplicação.
export function filtroDoBarbeiro(sessao: Sessao): { barbeiroId?: string } {
  return sessao.papel === 'DONO' ? {} : { barbeiroId: sessao.sub };
}
