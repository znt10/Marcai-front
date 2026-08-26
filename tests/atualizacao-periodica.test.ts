import { describe, it, expect, vi } from 'vitest';
import { criarCiclo, type Relogio } from '@/lib/atualizacao-periodica';

/// Um relógio de mentira: guarda o que foi agendado e só dispara quando o
/// teste manda. Nada aqui espera tempo real passar — o ciclo recebe o
/// relógio pronto, como `slotsLivres` recebe o `agora`.
function relogioFalso() {
  let proximoId = 1;
  const pendentes = new Map<number, { fn: () => void; ms: number }>();
  const relogio: Relogio = {
    agendar: (fn, ms) => {
      const id = proximoId++;
      pendentes.set(id, { fn, ms });
      return id;
    },
    cancelar: (id) => { pendentes.delete(id); },
  };
  return {
    relogio,
    quantosPendentes: () => pendentes.size,
    /// Dispara todos os temporizadores no ar, uma vez.
    avancar() {
      for (const [id, { fn }] of [...pendentes]) { pendentes.delete(id); fn(); }
    },
    /// O atraso do temporizador agendado por último.
    ultimoAtraso: () => [...pendentes.values()].at(-1)?.ms,
  };
}

const montar = (visivel = () => true) => {
  const r = relogioFalso();
  const aoTocar = vi.fn();
  const ciclo = criarCiclo({ intervaloMs: 30_000, visivel, aoTocar, relogio: r.relogio });
  return { ...r, aoTocar, ciclo };
};

describe('criarCiclo', () => {
  it('não chama nada ao iniciar: quem monta a tela já carregou', () => {
    const { ciclo, aoTocar } = montar();
    ciclo.iniciar();
    expect(aoTocar).not.toHaveBeenCalled();
  });

  it('chama uma vez a cada intervalo', () => {
    const { ciclo, aoTocar, avancar, ultimoAtraso } = montar();
    ciclo.iniciar();
    expect(ultimoAtraso()).toBe(30_000);

    avancar();
    expect(aoTocar).toHaveBeenCalledTimes(1);

    avancar();
    expect(aoTocar).toHaveBeenCalledTimes(2);
  });

  it('com a aba escondida não busca nada, mas continua no ar', () => {
    let visivel = false;
    const { ciclo, aoTocar, avancar, quantosPendentes } = montar(() => visivel);
    ciclo.iniciar();

    avancar();
    avancar();
    expect(aoTocar).not.toHaveBeenCalled();
    expect(quantosPendentes()).toBe(1); // segue reagendando: só a busca é pulada

    visivel = true;
    avancar();
    expect(aoTocar).toHaveBeenCalledTimes(1);
  });

  it('reabrir a aba busca na hora, sem esperar o intervalo', () => {
    let visivel = false;
    const { ciclo, aoTocar, avancar } = montar(() => visivel);
    ciclo.iniciar();

    visivel = true;
    ciclo.aoMudarVisibilidade();
    expect(aoTocar).toHaveBeenCalledTimes(1);

    // e o relógio recomeça do zero a partir daqui, sem tocar duas vezes
    // seguidas por causa do temporizador que já estava correndo.
    avancar();
    expect(aoTocar).toHaveBeenCalledTimes(2);
  });

  it('esconder a aba não busca nada', () => {
    let visivel = true;
    const { ciclo, aoTocar } = montar(() => visivel);
    ciclo.iniciar();

    visivel = false;
    ciclo.aoMudarVisibilidade();
    expect(aoTocar).not.toHaveBeenCalled();
  });

  it('parar cancela o que estava agendado', () => {
    const { ciclo, aoTocar, avancar, quantosPendentes } = montar();
    ciclo.iniciar();
    ciclo.parar();

    expect(quantosPendentes()).toBe(0);
    avancar();
    expect(aoTocar).not.toHaveBeenCalled();
  });

  it('iniciar duas vezes não deixa dois relógios correndo', () => {
    const { ciclo, aoTocar, avancar, quantosPendentes } = montar();
    ciclo.iniciar();
    ciclo.iniciar();

    expect(quantosPendentes()).toBe(1);
    avancar();
    expect(aoTocar).toHaveBeenCalledTimes(1);
  });
});
