import { describe, it, expect } from 'vitest';
import { textoDaConfirmacao } from '@/lib/bloqueio';

const base = { clienteId: 'c', nome: 'Maria', whatsapp: '83982217869', bloqueado: false };

describe('textoDaConfirmacao', () => {
  it('avisa quantos horarios vao ser cancelados', () => {
    expect(textoDaConfirmacao({ ...base, horarios: 3 })).toBe(
      'Bloquear Maria ((83) 9 8221-7869)? Esse número não vai conseguir marcar pelo site, '
      + 'e os 3 horários marcados vão ser cancelados sem aviso.',
    );
  });

  it('um horario so, no singular', () => {
    expect(textoDaConfirmacao({ ...base, horarios: 1 })).toContain(
      'e o horário marcado vai ser cancelado sem aviso.',
    );
  });

  it('nao supoe o genero de quem marcou: na barbearia quem marca e mais Joao que Maria', () => {
    const t = textoDaConfirmacao({ ...base, nome: 'João', horarios: 2 });
    expect(t).not.toMatch(/\bEla\b|\bela\b/);
  });

  it('sem horario marcado, a segunda metade some', () => {
    expect(textoDaConfirmacao({ ...base, horarios: 0 })).toBe(
      'Bloquear Maria ((83) 9 8221-7869)? Esse número não vai conseguir marcar pelo site.',
    );
  });
});
