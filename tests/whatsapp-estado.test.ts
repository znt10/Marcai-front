import { describe, expect, it } from 'vitest';
import { CAMINHO_DO_QR, faixaDoWhatsapp, textoDoInterruptorBot } from '@/lib/whatsapp-estado';

/// A combinação estado × papel, que é onde o erro caro mora: um barbeiro com
/// caminho para o QR ligaria o WhatsApp da barbearia ao próprio celular; um
/// dono sem faixa nenhuma perderia a manhã sem saber que o vínculo caiu.

const AGORA = new Date('2026-09-16T17:30:00-03:00');

const comZap = {
  plano: 'COM_ZAP' as const,
  estado: 'DESCONECTADO' as const,
  desconectadoDesde: null,
  naoEnviadas: 0,
};

describe('faixaDoWhatsapp', () => {
  it('não mostra nada no plano sem zap', () => {
    // Não há vínculo que possa cair — uma faixa aqui seria falar de um
    // produto que a barbearia não comprou.
    expect(
      faixaDoWhatsapp({ ...comZap, plano: 'SEM_ZAP', estado: null }, 'DONO', AGORA),
    ).toBeNull();
  });

  it('não mostra nada com o vínculo de pé', () => {
    expect(faixaDoWhatsapp({ ...comZap, estado: 'CONECTADO' }, 'DONO', AGORA)).toBeNull();
  });

  it.each(['PENDENTE', 'AGUARDANDO_QR', 'DESCONECTADO'] as const)(
    'mostra faixa em %s',
    (estado) => {
      // `PENDENTE` entra junto de propósito: para quem olha, "ainda sendo
      // criado" e "caiu" são a mesma coisa — não sai mensagem.
      expect(faixaDoWhatsapp({ ...comZap, estado }, 'DONO', AGORA)).not.toBeNull();
    },
  );

  it('dá ao dono um caminho para conectar', () => {
    const faixa = faixaDoWhatsapp(comZap, 'DONO', AGORA)!;
    expect(faixa.link).toBe(CAMINHO_DO_QR);
    expect(faixa.acao).toBe('conectar');
  });

  it('troca o verbo quando já há um QR esperando', () => {
    const faixa = faixaDoWhatsapp({ ...comZap, estado: 'AGUARDANDO_QR' }, 'DONO', AGORA)!;
    expect(faixa.acao).toBe('ler o QR');
  });

  it('não dá ao barbeiro caminho nenhum', () => {
    const faixa = faixaDoWhatsapp(comZap, 'BARBEIRO', AGORA)!;
    expect(faixa.link).toBeNull();
    expect(faixa.acao).toBeNull();
    expect(faixa.texto).toContain('avise o dono');
  });

  it('diz a hora da queda quando foi hoje', () => {
    // Sem isto a faixa diria só "desconectado", e o dono não saberia se caiu
    // agora (a internet piscando) ou de manhã (perdeu o dia).
    const faixa = faixaDoWhatsapp(
      { ...comZap, desconectadoDesde: '2026-09-16T17:02:00-03:00' }, 'DONO', AGORA,
    )!;
    expect(faixa.texto).toContain('desde 17:02');
  });

  it('diz a data quando a queda foi noutro dia', () => {
    const faixa = faixaDoWhatsapp(
      { ...comZap, desconectadoDesde: '2026-09-14T22:10:00-03:00' }, 'DONO', AGORA,
    )!;
    expect(faixa.texto).toContain('desde 14/09');
  });

  it('aguenta data inválida sem sujar a faixa', () => {
    const faixa = faixaDoWhatsapp({ ...comZap, desconectadoDesde: 'vish' }, 'DONO', AGORA)!;
    expect(faixa.texto).not.toContain('Invalid');
    expect(faixa.texto).not.toContain('NaN');
  });

  it('conta as mensagens retidas, no singular e no plural', () => {
    const uma = faixaDoWhatsapp({ ...comZap, naoEnviadas: 1 }, 'DONO', AGORA)!;
    const varias = faixaDoWhatsapp({ ...comZap, naoEnviadas: 4 }, 'DONO', AGORA)!;
    expect(uma.texto).toContain('1 mensagem não enviada');
    expect(varias.texto).toContain('4 mensagens não enviadas');
  });

  it('mostra a contagem para o barbeiro também', () => {
    // É ele que atende o cliente que liga perguntando por que não recebeu
    // nada — saber quantas ficaram para trás é o tamanho do problema.
    const faixa = faixaDoWhatsapp({ ...comZap, naoEnviadas: 2 }, 'BARBEIRO', AGORA)!;
    expect(faixa.texto).toContain('2 mensagens não enviadas');
  });

  it('omite a contagem quando não há nenhuma', () => {
    expect(faixaDoWhatsapp(comZap, 'DONO', AGORA)!.texto).not.toContain('mensagem');
  });
});

describe('textoDoInterruptorBot', () => {
  it('descreve o desligado como o que acontece SE ligar, não como já ligado', () => {
    // "Ligado, o robô responde…" ao lado de um interruptor "Desligado" lia
    // como se o robô já estivesse respondendo — o oposto do que a tela mostra.
    const texto = textoDoInterruptorBot(false);
    expect(texto.startsWith('Se ligar')).toBe(true);
    expect(texto).not.toMatch(/^Ligado,/);
  });

  it('mantém o texto do ligado como está', () => {
    expect(textoDoInterruptorBot(true)).toContain(
      'Quem escreve para este número recebe um menu para marcar ou cancelar.',
    );
  });
});
