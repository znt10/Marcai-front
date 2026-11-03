import { describe, it, expect } from 'vitest';
import { linkDoLembrete, textoProntoDoLembrete } from '@/lib/lembretePorToque';

describe('linkDoLembrete', () => {
  it('abre o WhatsApp do número central com a mensagem pronta', () => {
    expect(linkDoLembrete('83988982852', 'Brutus', 'k7p2q9abcd')).toBe(
      'https://wa.me/5583988982852?text=' +
        encodeURIComponent('Quero o lembrete do meu horário na Brutus. Código: k7p2q9abcd'),
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
      'Quero o lembrete do meu horário na Brutus. Código: k7p2q9abcd',
    );
  });
});
