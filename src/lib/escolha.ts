/// A escolha do cliente — barbeiro, serviço, horário — enquanto ela ainda não
/// virou agendamento.
///
/// Ela mora no estado do React em `/agendar`, e todo link deste produto é
/// `<a href>`, não `next/link`: cada ida ao calendário é um carregamento
/// inteiro de página, que destrói esse estado. A ÚNICA coisa que sobrevive é a
/// querystring, lida no servidor e devolvida ao formulário como `inicial`.
/// Por isso a escolha viaja aqui, e por isso quem monta uma URL entre
/// `/agendar` e `/calendario` monta por estas funções: um link escrito à mão
/// que esqueça um parâmetro apaga a escolha da pessoa sem dizer nada.
export type Escolha = { barbeiroId?: string; servicoId?: string; inicio?: string };

/// Ordem fixa (barbeiro, serviço, horário) e não a ordem do objeto: URL igual
/// para escolha igual é o que deixa o teste comparar string, e o que evita
/// duas entradas diferentes no histórico para o mesmo estado.
const query = ({ barbeiroId, servicoId, inicio }: Escolha) => {
  const p = new URLSearchParams();
  if (barbeiroId) p.set('barbeiroId', barbeiroId);
  if (servicoId) p.set('servicoId', servicoId);
  if (inicio) p.set('inicio', inicio);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const urlAgendar = (e: Escolha) => `/agendar${query(e)}`;
export const urlCalendario = (e: Escolha) => `/calendario${query(e)}`;
