import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz';
import { addDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FUSO } from './config';

/// ÚNICO arquivo do projeto que importa date-fns-tz.
/// Espalhar conversão de fuso é o jeito mais rápido de produzir bug de
/// agenda que só aparece meses depois.

export function localParaUtc(dia: string, minutos: number): Date {
  const h = String(Math.floor(minutos / 60)).padStart(2, '0');
  const m = String(minutos % 60).padStart(2, '0');
  return fromZonedTime(`${dia}T${h}:${m}:00`, FUSO);
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

export const diaDeHoje = (agora: Date) => utcParaLocal(agora).dia;

/// Ancorado ao meio-dia de propósito: às 00:00 qualquer deslocamento de fuso
/// empurraria o resultado para o dia anterior.
export const somarDias = (dia: string, n: number) =>
  format(addDays(parseISO(`${dia}T12:00:00`), n), 'yyyy-MM-dd');

export const diaSemanaDe = (dia: string) => parseISO(`${dia}T12:00:00`).getDay();
