'use client';
import { useState } from 'react';
import { amostrarLogo, logoSomeNoFundo } from '@/lib/logo';

/// A `<img>` da logo que se redesenha na cor de destaque quando sumiria no
/// fundo da tela (07/11/2026). Primeiro aparece como veio; ao carregar, o
/// navegador mede a cor média e, se ela for apagada demais sobre o fundo, a
/// mesma silhueta passa a ser pintada com o destaque (máscara CSS).
///
/// `fundo`/`destaque` vêm de quem chama quando a tela não é a do `<html>`
/// (a prévia do painel); senão, das variáveis da paleta do `<html>`.
export function LogoAdaptada({ src, alt, width, height, style, className, fundo, destaque }: {
  src: string; alt: string; width?: number; height?: number;
  style?: React.CSSProperties; className?: string; fundo?: string; destaque?: string;
}) {
  const [pintar, setPintar] = useState<string | null>(null);

  function medir(img: HTMLImageElement) {
    const raiz = getComputedStyle(document.documentElement);
    const f = fundo ?? raiz.getPropertyValue('--color-fundo').trim();
    const d = destaque ?? raiz.getPropertyValue('--color-acento').trim();
    const amostra = amostrarLogo(img);
    setPintar(amostra && /^#[0-9a-f]{6}$/i.test(f) && logoSomeNoFundo(amostra, f) ? d : null);
  }

  return (
    <span className="relative mx-auto block w-fit max-w-full">
      <img src={src} alt={alt} width={width} height={height} style={style}
           className={`${className ?? ''} ${pintar ? 'invisible' : ''}`}
           // A prévia troca o fundo sem trocar a imagem: mede de novo.
           key={`${src}|${fundo ?? ''}`}
           ref={(el) => { if (el?.complete && el.naturalWidth) medir(el); }}
           onLoad={(e) => medir(e.currentTarget)} />
      {pintar && (
        <span aria-hidden className="absolute inset-0"
              style={{
                background: pintar,
                WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")`,
                WebkitMaskSize: 'contain', maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center', maskPosition: 'center',
              }} />
      )}
    </span>
  );
}
