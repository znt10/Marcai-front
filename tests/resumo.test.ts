import { describe, it, expect } from 'vitest';
import {
  periodoDe, andar, rotuloDe, modoDoPeriodo, porcentagens, type Modo,
} from '@/lib/resumo';

// 2026-09-05 e' um SABADO — o ultimo dia da semana quando a semana comeca no
// domingo, entao ele e' a ancora que mais denuncia erro de convencao: com a
// convencao errada (semana comecando na segunda) a semana sairia inteira
// deslocada, e um teste ancorado numa quarta-feira nao acusaria nada.
const HOJE = '2026-09-05';

describe('periodoDe — dia', () => {
  it('e um dia so', () => {
    expect(periodoDe('dia', HOJE)).toEqual({ de: HOJE, ate: HOJE });
  });
});

describe('periodoDe — semana', () => {
  it('vai de domingo a sabado, nao de terca a terca', () => {
    // 2026-08-30 e' domingo; 2026-09-05, sabado.
    expect(periodoDe('semana', HOJE)).toEqual({ de: '2026-08-30', ate: '2026-09-05' });
  });

  it('a mesma semana sai de qualquer dia dentro dela', () => {
    const alvo = { de: '2026-08-30', ate: '2026-09-05' };
    for (const d of ['2026-08-30', '2026-09-01', '2026-09-03', '2026-09-05']) {
      expect(periodoDe('semana', d)).toEqual(alvo);
    }
  });

  it('domingo e' + ' o PRIMEIRO dia da sua semana, nao o ultimo', () => {
    // O erro classico: usar a convencao segunda=0 faz o domingo cair na
    // semana anterior, e a semana inteira anda um dia.
    expect(periodoDe('semana', '2026-08-30')).toEqual({
      de: '2026-08-30', ate: '2026-09-05',
    });
  });

  it('atravessa a virada do mes sem se partir', () => {
    expect(periodoDe('semana', '2026-10-01')).toEqual({
      de: '2026-09-27', ate: '2026-10-03',
    });
  });

  it('atravessa a virada do ano', () => {
    // 2027-01-01 e' uma sexta; a semana comeca no domingo 2026-12-27.
    expect(periodoDe('semana', '2027-01-01')).toEqual({
      de: '2026-12-27', ate: '2027-01-02',
    });
  });
});

describe('periodoDe — mes', () => {
  it('vai do dia 1 ao ULTIMO dia, nao ate hoje', () => {
    // Mes de calendario inteiro: e' o que deixa comparar setembro com agosto.
    // O servico so' conta `fim <= agora`, entao pedir o mes inteiro no dia 5
    // devolve o mesmo numero que pedir 1 a 5 — o alcance e' honesto e a conta
    // nao infla.
    expect(periodoDe('mes', HOJE)).toEqual({ de: '2026-09-01', ate: '2026-09-30' });
  });

  it('sabe o comprimento de cada mes', () => {
    expect(periodoDe('mes', '2026-08-15').ate).toBe('2026-08-31');
    expect(periodoDe('mes', '2026-02-10').ate).toBe('2026-02-28');
    expect(periodoDe('mes', '2026-12-25').ate).toBe('2026-12-31');
  });

  it('sabe de ano bissexto', () => {
    expect(periodoDe('mes', '2028-02-10').ate).toBe('2028-02-29');
  });
});

describe('andar', () => {
  it('anda um dia de cada vez no modo dia', () => {
    expect(andar('dia', HOJE, -1)).toBe('2026-09-04');
    expect(andar('dia', HOJE, 1)).toBe('2026-09-06');
  });

  it('anda sete dias de cada vez no modo semana', () => {
    expect(andar('semana', HOJE, -1)).toBe('2026-08-29');
    expect(periodoDe('semana', andar('semana', HOJE, -1))).toEqual({
      de: '2026-08-23', ate: '2026-08-29',
    });
  });

  it('anda um MES, nao trinta dias', () => {
    // Somar 30 dias a 31/01 da 02/03 e pula fevereiro inteiro. A ancora do
    // modo mes e' sempre o dia 1 justamente para esse buraco nao existir.
    expect(andar('mes', '2026-01-31', 1)).toBe('2026-02-01');
    expect(andar('mes', '2026-03-31', -1)).toBe('2026-02-01');
  });

  it('atravessa a virada do ano nos dois sentidos', () => {
    expect(andar('mes', '2026-12-10', 1)).toBe('2027-01-01');
    expect(andar('mes', '2026-01-10', -1)).toBe('2025-12-01');
  });

  it('andar e voltar volta para o mesmo periodo', () => {
    for (const modo of ['dia', 'semana', 'mes'] as Modo[]) {
      const ida = andar(modo, HOJE, -3);
      expect(periodoDe(modo, andar(modo, ida, 3))).toEqual(periodoDe(modo, HOJE));
    }
  });
});

describe('rotuloDe', () => {
  it('o dia de hoje se chama hoje', () => {
    expect(rotuloDe('dia', HOJE, HOJE)).toBe('hoje');
    expect(rotuloDe('dia', '2026-09-04', HOJE)).toBe('ontem');
    expect(rotuloDe('dia', '2026-09-01', HOJE)).toBe('1 set');
  });

  it('a semana mostra as duas pontas, e repete o mes so quando muda', () => {
    expect(rotuloDe('semana', HOJE, HOJE)).toBe('30 ago – 5 set');
    expect(rotuloDe('semana', '2026-09-10', HOJE)).toBe('6 – 12 set');
  });

  it('o mes e chamado pelo nome', () => {
    expect(rotuloDe('mes', HOJE, HOJE)).toBe('setembro');
    expect(rotuloDe('mes', '2026-08-01', HOJE)).toBe('agosto');
    expect(rotuloDe('mes', '2026-10-01', HOJE)).toBe('outubro');
  });

  it('o ano so aparece quando nao e o corrente', () => {
    // Sem isso, "setembro" de 2025 e de 2026 se leem iguais na tela.
    expect(rotuloDe('mes', '2025-09-01', HOJE)).toBe('setembro 2025');
    expect(rotuloDe('semana', '2025-09-03', HOJE)).toBe('31 ago – 6 set 2025');
  });
});

describe('modoDoPeriodo', () => {
  it('reconhece cada modo de volta', () => {
    for (const modo of ['dia', 'semana', 'mes'] as Modo[]) {
      expect(modoDoPeriodo(periodoDe(modo, HOJE))).toBe(modo);
    }
  });

  it('intervalo digitado a mao nao acende modo nenhum', () => {
    expect(modoDoPeriodo({ de: '2026-09-10', ate: '2026-09-20' })).toBeNull();
    // Sete dias, mas comecando numa terca: e' exatamente o que o usuario NAO
    // queria que a semana fosse.
    expect(modoDoPeriodo({ de: '2026-09-01', ate: '2026-09-07' })).toBeNull();
  });

  it('um mes que nao comeca no dia 1 nao e o modo mes', () => {
    expect(modoDoPeriodo({ de: '2026-09-02', ate: '2026-10-01' })).toBeNull();
  });
});

describe('porcentagens', () => {
  it('somam exatamente 100 mesmo quando o arredondamento nao ajuda', () => {
    // 14/31, 11/31, 6/31 = 45,16% / 35,48% / 19,35%. Arredondando cada uma por
    // conta propria da 45+35+19 = 99, e a tela mostra tres numeros que nao
    // fecham — numa pizza, isso e' um convite para desconfiar do resto.
    expect(porcentagens([14, 11, 6])).toEqual([45, 36, 19]);
    expect(porcentagens([14, 11, 6]).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('o ponto que sobra vai para o maior resto, nao para o primeiro da fila', () => {
    // 1/3 cada: restos identicos, entao o desempate cai na ordem — mas a soma
    // tem de fechar de qualquer jeito.
    const p = porcentagens([1, 1, 1]);
    expect(p.reduce((a, b) => a + b, 0)).toBe(100);
    expect(p.filter((x) => x === 34)).toHaveLength(1);
  });

  it('nao inventa nem apaga fatia', () => {
    expect(porcentagens([30, 1])).toEqual([97, 3]);
    expect(porcentagens([1])).toEqual([100]);
  });

  it('total zero devolve zeros, sem dividir por zero', () => {
    expect(porcentagens([0, 0])).toEqual([0, 0]);
  });
});
