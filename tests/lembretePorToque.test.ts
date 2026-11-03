import { describe, it, expect, vi } from 'vitest';
import { criarEsperaDoToque, linkDoLembrete, textoProntoDoLembrete } from '@/lib/lembretePorToque';
import type { Relogio } from '@/lib/atualizacao-periodica';

describe('linkDoLembrete', () => {
  it('abre o WhatsApp do número central com a mensagem pronta', () => {
    expect(linkDoLembrete('83988982852', 'Brutus', 'k7p2q9abcd')).toBe(
      'https://wa.me/5583988982852?text=' +
        encodeURIComponent('Quero o lembrete do meu horário em Brutus. Código: k7p2q9abcd'),
    );
  });

  it('nome com acento e & volta igual depois de decodificar', () => {
    const link = new URL(linkDoLembrete('83988982852', 'Barbearia & Cia São João', 'k7p2q9abcd'));
    expect(link.searchParams.get('text')).toBe(
      textoProntoDoLembrete('Barbearia & Cia São João', 'k7p2q9abcd'),
    );
  });
});

describe('textoProntoDoLembrete', () => {
  it('é o mesmo texto do back (lembrete_por_toque.texto_pronto)', () => {
    expect(textoProntoDoLembrete('Brutus', 'k7p2q9abcd')).toBe(
      'Quero o lembrete do meu horário em Brutus. Código: k7p2q9abcd',
    );
  });
});

/// Relógio de mentira, como em atualizacao-periodica.test.ts.
function relogioFalso() {
  let proximoId = 1;
  const pendentes = new Map<number, () => void>();
  const relogio: Relogio = {
    agendar: (fn) => { const id = proximoId++; pendentes.set(id, fn); return id; },
    cancelar: (id) => { pendentes.delete(id); },
  };
  return {
    relogio,
    quantosPendentes: () => pendentes.size,
    avancar() { for (const [id, fn] of [...pendentes]) { pendentes.delete(id); fn(); } },
  };
}

describe('criarEsperaDoToque', () => {
  /// O webhook da Meta pode chegar segundos DEPOIS de a pessoa voltar do
  /// WhatsApp: uma busca só ao voltar mostraria o botão de novo, e ela
  /// tocaria outra vez.
  const montar = (visivel = () => true, vezes = 3) => {
    const r = relogioFalso();
    const atualizar = vi.fn();
    const espera = criarEsperaDoToque({ atualizar, visivel, relogio: r.relogio, vezes });
    return { ...r, atualizar, espera };
  };

  it('ao voltar para a aba busca na hora e continua buscando', () => {
    const { espera, atualizar, avancar } = montar();
    espera.iniciar();
    espera.aoMudarVisibilidade();
    expect(atualizar).toHaveBeenCalledTimes(1);
    avancar();
    expect(atualizar).toHaveBeenCalledTimes(2);
  });

  it('para depois de algumas buscas: quem tocou e não mandou não fica buscando para sempre', () => {
    const { espera, atualizar, avancar, quantosPendentes } = montar();
    espera.iniciar();
    for (let i = 0; i < 10; i++) avancar();
    expect(atualizar).toHaveBeenCalledTimes(3);
    expect(quantosPendentes()).toBe(0);
  });

  it('com a aba escondida (a pessoa está no WhatsApp) não busca nem gasta as vezes', () => {
    let visivel = false;
    const { espera, atualizar, avancar } = montar(() => visivel);
    espera.iniciar();
    for (let i = 0; i < 10; i++) avancar();
    expect(atualizar).not.toHaveBeenCalled();
    visivel = true;
    espera.aoMudarVisibilidade();
    avancar();
    avancar();
    expect(atualizar).toHaveBeenCalledTimes(3);
  });

  it('parar cancela o que estava agendado', () => {
    const { espera, quantosPendentes } = montar();
    espera.iniciar();
    espera.parar();
    expect(quantosPendentes()).toBe(0);
  });
});
