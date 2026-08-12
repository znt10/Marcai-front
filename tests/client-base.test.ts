import { describe, it, expect } from 'vitest';
import { baseDe } from '@/lib/api/client';

const EXTERNA = 'http://brutus.localhost:8000';

describe('baseDe', () => {
  it('com a lista vazia, tudo continua no Next', () => {
    expect(baseDe('/painel/agenda', [])).toBe('/api');
    expect(baseDe('/servicos', [])).toBe('/api');
  });

  it('prefixo migrado sai para o Django', () => {
    expect(baseDe('/painel/agenda', ['/painel'])).toBe(`${EXTERNA}/api`);
  });

  it('casa o prefixo exato, e nao por comeco de palavra', () => {
    // Sem esta regra, migrar '/painel' arrastaria junto um '/painelzinho'
    // que ninguem migrou — e o sintoma seria 404 numa rota que existe.
    expect(baseDe('/painelzinho', ['/painel'])).toBe('/api');
    expect(baseDe('/painel', ['/painel'])).toBe(`${EXTERNA}/api`);
  });

  it('nao casa por prefixo textual quando o segmento nao fecha', () => {
    // Mesma regra do caso acima, com um par que a tarefa pede para conferir
    // explicitamente: '/agendamentos' nao pode ser pego por '/agenda' migrado,
    // e uma rota que esta na lista continua casando os seus proprios
    // sub-caminhos.
    expect(baseDe('/agendamentos', ['/agenda'])).toBe('/api');
    expect(baseDe('/agenda/hoje', ['/agenda'])).toBe(`${EXTERNA}/api`);
  });
});
