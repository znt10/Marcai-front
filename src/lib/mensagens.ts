import { formatarDiaLongo, formatarHora } from './datas';

/// Todo texto que sai pelo WhatsApp mora aqui. Espalhar template pelas rotas
/// é como duas mensagens do mesmo evento acabam divergindo.
type Dados = {
  clienteNome: string; barbeiroNome: string; servicoNome: string;
  inicio: Date; endereco: string; link: string;
};

export const msgConfirmacao = (d: Dados) =>
  `Fechou, ${d.clienteNome.split(' ')[0]}! Seu ${d.servicoNome.toLowerCase()} ` +
  `está marcado para ${formatarDiaLongo(d.inicio)} às ${formatarHora(d.inicio)} ` +
  `com ${d.barbeiroNome}.\n\n${d.endereco}\n\n` +
  `Precisa cancelar? ${d.link}`;

export const msgCancelamento = (d: Omit<Dados, 'link'>) =>
  `Seu horário de ${formatarDiaLongo(d.inicio)} às ${formatarHora(d.inicio)} ` +
  `com ${d.barbeiroNome} foi cancelado. Até a próxima!`;

export const msgLembrete = (d: Omit<Dados, 'link'>) =>
  `Lembrete: ${d.servicoNome.toLowerCase()} hoje às ${formatarHora(d.inicio)} ` +
  `com ${d.barbeiroNome}. ${d.endereco}`;
