import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { iconesDoApp } from '@/lib/icones';
import { TIPOS } from '@/lib/tipos';

/// O ícone de instalar por tipo (28/10/2026). Um caminho errado aqui não
/// quebra nada na tela: só faz o app instalar sem ícone. Daí conferir o arquivo.
describe('iconesDoApp', () => {
  it('todo tipo aponta para arquivos que existem em public/', () => {
    for (const t of [...TIPOS, undefined]) {
      for (const src of Object.values(iconesDoApp(t))) {
        expect(existsSync(resolve(__dirname, '../public', `.${src}`)), `${t}: ${src}`).toBe(true);
      }
    }
  });

  it('a manicure instala as unhas; a barbearia, a marca de sempre', () => {
    expect(iconesDoApp('MANICURE').p512).toBe('/icones/manicure-512.png');
    expect(iconesDoApp('CABELEIREIRA').apple).toBe('/icones/cabeleireira-apple.png');
    expect(iconesDoApp('BARBEARIA').p512).toBe('/marca-512.png');
    expect(iconesDoApp('OUTRO')).toEqual(iconesDoApp(undefined));
  });
});
