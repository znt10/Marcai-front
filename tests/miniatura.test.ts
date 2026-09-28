import { describe, expect, it } from 'vitest';
import { cartaoDoLink, origemDoPedido } from '@/lib/miniatura';

describe('origemDoPedido', () => {
  it('produção sai em https mesmo com o salto interno em http', () => {
    // O Traefik termina o TLS e fala http com o Next: o `x-forwarded-proto`
    // é o que diz como o CLIENTE chegou.
    expect(origemDoPedido('brutus.usemarcai.online', 'https')).toBe('https://brutus.usemarcai.online');
  });

  it('sem cabeçalho de protocolo, assume https', () => {
    // O WhatsApp não abre imagem de preview em http; errar para o lado seguro.
    expect(origemDoPedido('brutus.usemarcai.online', null)).toBe('https://brutus.usemarcai.online');
  });

  it('localhost fica em http, com a porta', () => {
    expect(origemDoPedido('brutus.localhost:3000', null)).toBe('http://brutus.localhost:3000');
  });

  it('proxy com lista de protocolos: vale o primeiro', () => {
    expect(origemDoPedido('brutus.usemarcai.online', 'https,http')).toBe('https://brutus.usemarcai.online');
  });
});

describe('cartaoDoLink', () => {
  it('traz título, descrição e a imagem com endereço absoluto', () => {
    const m = cartaoDoLink({
      origem: 'https://brutus.usemarcai.online',
      titulo: 'Brutus',
      descricao: 'Marque seu horário.',
    });
    expect(m.openGraph).toMatchObject({
      title: 'Brutus',
      description: 'Marque seu horário.',
      type: 'website',
      images: [{ url: 'https://brutus.usemarcai.online/miniatura', width: 1200, height: 630 }],
    });
  });
});
