import { relogioDoNavegador, type Relogio } from './atualizacao-periodica';

/// Lembrete por toque (Marcai-back, spec 2026-11-03): o cliente toca em
/// "Quero o lembrete no WhatsApp", o WhatsApp abre com esta mensagem para o
/// número central, e só quem manda recebe a confirmação e o lembrete de 1h
/// antes — de graça, porque foi ele quem escreveu primeiro.
///
/// O texto é o MESMO de `lembrete_por_toque.texto_pronto` no back ("em", e
/// não "na": o nome pode ser "Dom Tony" ou "Espaço Bela"). O back
/// procura só o código, então o cliente pode apagar o resto.

export function textoProntoDoLembrete(barbeariaNome: string, codigo: string): string {
  return `Quero o lembrete do meu horário em ${barbeariaNome}. Código: ${codigo}`;
}

/// `central` em dígitos nacionais (`83988982852`), como vem em
/// `whatsappCentral` de GET /api/barbearia.
export function linkDoLembrete(central: string, barbeariaNome: string, codigo: string): string {
  return `https://wa.me/55${central}?text=${encodeURIComponent(textoProntoDoLembrete(barbeariaNome, codigo))}`;
}

export type EsperaDoToque = { iniciar: () => void; parar: () => void; aoMudarVisibilidade: () => void };

/// Depois do toque, a tela busca de novo até o back dizer `lembretePedido`.
/// Uma busca só ao voltar para a aba não basta: o webhook da Meta pode chegar
/// segundos depois, a pessoa veria o botão de novo e tocaria outra vez.
///
/// Só conta busca feita com a aba à vista — enquanto a pessoa está no
/// WhatsApp, nada acontece — e para depois de `vezes`, para quem tocou e não
/// mandou não ficar buscando para sempre. Relógio injetado como em
/// `atualizacao-periodica`.
export function criarEsperaDoToque(e: {
  atualizar: () => void;
  visivel: () => boolean;
  relogio?: Relogio;
  intervaloMs?: number;
  vezes?: number;
}): EsperaDoToque {
  const relogio = e.relogio ?? relogioDoNavegador;
  const intervaloMs = e.intervaloMs ?? 3_000;
  const vezes = e.vezes ?? 20;
  let restam = vezes;
  let id: number | null = null;

  const parar = () => {
    if (id !== null) { relogio.cancelar(id); id = null; }
  };
  const agendar = () => {
    parar();
    if (restam > 0) id = relogio.agendar(tocar, intervaloMs);
  };
  const buscar = () => {
    if (!e.visivel() || restam <= 0) return;
    e.atualizar();
    restam--;
  };
  function tocar() {
    id = null;
    buscar();
    agendar();
  }

  return {
    iniciar: () => { restam = vezes; agendar(); },
    parar,
    aoMudarVisibilidade: () => {
      if (!e.visivel() || restam <= 0) return;
      buscar();
      agendar();
    },
  };
}
