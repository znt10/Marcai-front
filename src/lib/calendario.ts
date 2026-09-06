/// Os dois caminhos para o horário cair no calendário de quem marcou.
///
/// ## Por que dois, e não um
///
/// O **`.ics`** resolve iPhone e Android: o aparelho reconhece
/// `text/calendar` e abre a folha "Adicionar Evento" do calendário nativo.
/// O **link do Google Agenda** resolve quem usa Google Agenda no navegador —
/// não baixa arquivo nenhum e não obriga a achar o download depois.
///
/// Nenhum dos dois serve os dois casos, e por isso são dois botões.

/// A URL do arquivo no servidor — e é *no servidor* que está o ponto.
///
/// A versão anterior montava o mesmo `.ics` aqui no navegador, num `Blob` com
/// `a.download = 'agendamento.ics'`. Isso funciona no Android e no
/// computador, e **não funciona no iPhone**: o Safari do iOS ignora o atributo
/// `download` em URL `blob:`. O botão não fazia nada, ou abria o texto cru do
/// arquivo na tela — que foi como o defeito apareceu.
///
/// Recebe a `origem` em vez de chamar `baseDe()`: aquela lê `window.location`
/// e ESTOURA no servidor, e `Confirmado` é Client Component — o que quer dizer
/// que o Next o renderiza no servidor também. Montada lá em cima
/// (`origemDoTenantNoServidor()`) e passada como prop, a URL já vem certa na
/// primeira pintura, que é o que faz o link funcionar antes da hidratação.
export function urlDoIcs(origem: string, codigo: string): string {
  return `${origem}/api/agendamentos/${encodeURIComponent(codigo)}/ics`;
}

/// Espelha `link_do_google_agenda` de `app/services/calendario.py`. As duas
/// existem porque os dois lados precisam do link em momentos diferentes — o
/// Django para pôr na mensagem do WhatsApp, este para pôr no botão — e nenhum
/// dos dois vale a viagem de rede que evitaria a duplicação.
export function linkDoGoogleAgenda(p: {
  servicoNome: string; barbeiroNome: string;
  inicioIso: string; fimIso: string; endereco: string;
}): string {
  // `20260910T120000Z`: o mesmo formato do `.ics`, e pelo mesmo motivo — em
  // UTC não há fuso para o Google interpretar errado.
  const emUtc = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const parametros = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${p.servicoNome} com ${p.barbeiroNome}`,
    dates: `${emUtc(p.inicioIso)}/${emUtc(p.fimIso)}`,
    location: p.endereco,
    details: `${p.servicoNome} com ${p.barbeiroNome}.`,
  });
  return `https://calendar.google.com/calendar/render?${parametros}`;
}
