import { describe, it, expect } from 'vitest';
import { semSubdominio } from '@/lib/config';

/// O gêmeo de `tests/test_tenant_padrao.py` do back. O que se guarda aqui não é
/// a conveniência de testar pelo celular — é o RECORTE dela, e sobretudo que os
/// dois lados concordem sobre ele: o Django resolve o tenant, o proxy decide se
/// o domínio nu ainda é a página institucional, e os dois chamam esta mesma
/// regra. Se ela divergir, o mesmo endereço significa uma coisa de um lado e
/// outra do outro.
describe('semSubdominio', () => {
  it.each([
    ['10.220.0.207:3000', 'o IP da máquina na rede — o caso de uso'],
    ['192.168.0.15', 'outra faixa de rede doméstica'],
    ['localhost', 'o domínio nu, para o mesmo teste valer no PC'],
    ['LOCALHOST', 'maiúscula: host não diferencia caixa'],
  ])('%s cai na barbearia padrão (%s)', (host) => {
    expect(semSubdominio(host, 'localhost')).toBe(true);
  });

  it.each([
    ['brutus.localhost', 'tem subdomínio, e ele manda'],
    ['www.localhost', 'reservado: não é barbearia, e não vira uma'],
    ['a.b.localhost', 'subdomínio de subdomínio'],
    ['naoexiste.localhost', 'slug sem dono continua sem barbearia'],
    ['admin.localhost', 'o painel da plataforma não é barbearia'],
  ])('%s nunca cai no padrão (%s)', (host) => {
    expect(semSubdominio(host, 'localhost')).toBe(false);
  });

  it('recusa sufixo forjado como host de fora', () => {
    // `brutus.localhost.malicioso.com` não termina em `.localhost`, então é
    // host de fora — e, sendo de fora, cairia no padrão em dev. Isso é seguro
    // aqui e NÃO é no back: lá o mesmo host é recusado antes, por ALLOWED_HOSTS.
    expect(semSubdominio('brutus.localhost.malicioso.com', 'localhost')).toBe(true);
  });

  it('acompanha o domínio base, não uma string fixa', () => {
    expect(semSubdominio('brutus.10.0.0.7.nip.io', '10.0.0.7.nip.io')).toBe(false);
    expect(semSubdominio('10.0.0.7', '10.0.0.7.nip.io')).toBe(true);
  });
});
