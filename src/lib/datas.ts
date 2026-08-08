import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz';
import { addDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FUSO } from './config';

/// ÚNICO arquivo do projeto que importa date-fns-tz.
/// Espalhar conversão de fuso é o jeito mais rápido de produzir bug de
/// agenda que só aparece meses depois.

const MINUTOS_DIA = 24 * 60;

/// `minutos` pode ser 1440 — é como "o dia inteiro" se escreve num intervalo
/// semiaberto, e tanto a jornada quanto o bloqueio usam isso. Sem o
/// transbordo para o dia seguinte, a string sairia `T24:00:00`, que é **data
/// inválida**: e comparação com data inválida é sempre falsa, então o
/// bloqueio das 0h às 24h não bloqueava nada, em silêncio.
export function localParaUtc(dia: string, minutos: number): Date {
  const diasInteiros = Math.floor(minutos / MINUTOS_DIA);
  const doDia = minutos - diasInteiros * MINUTOS_DIA;
  const base = diasInteiros === 0 ? dia : somarDias(dia, diasInteiros);

  const h = String(Math.floor(doDia / 60)).padStart(2, '0');
  const m = String(doDia % 60).padStart(2, '0');
  return fromZonedTime(`${base}T${h}:${m}:00`, FUSO);
}

export function utcParaLocal(d: Date): { dia: string; minutos: number } {
  const local = toZonedTime(d, FUSO);
  return {
    dia: format(local, 'yyyy-MM-dd'),
    minutos: local.getHours() * 60 + local.getMinutes(),
  };
}

export const formatarHora = (d: Date) => formatInTimeZone(d, FUSO, 'HH:mm');

/// `EEEEEE` (short), não `EEE` (abbreviated): no ptBR do date-fns v4 o
/// abreviado é "quarta" por extenso; o de três letras que o wireframe pede
/// ("qua") só sai do formato curto.
export const formatarDiaLongo = (d: Date) =>
  formatInTimeZone(d, FUSO, 'EEEEEE d MMM', { locale: ptBR }).toLowerCase();

/// `dd/MM` para texto curto — mensagem de erro, aviso de tela. No fuso da
/// barbearia como tudo aqui: em servidor UTC, um horário das 22h daqui cairia
/// no dia seguinte.
export const formatarDiaCurto = (d: Date) => formatInTimeZone(d, FUSO, 'dd/MM');

export const diaDeHoje = (agora: Date) => utcParaLocal(agora).dia;

/// Ancorado ao meio-dia de propósito: às 00:00 qualquer deslocamento de fuso
/// empurraria o resultado para o dia anterior.
export const somarDias = (dia: string, n: number) =>
  format(addDays(parseISO(`${dia}T12:00:00`), n), 'yyyy-MM-dd');

export const diaSemanaDe = (dia: string) => parseISO(`${dia}T12:00:00`).getDay();
