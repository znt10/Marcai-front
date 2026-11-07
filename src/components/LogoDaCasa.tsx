import type { Tipo } from '@/lib/tipos';
import { Marca } from '@/components/Marca';
import type { LogoNaTela } from '@/lib/logo';
import { LogoAdaptada } from '@/components/LogoAdaptada';

/// A logo da casa em destaque, ou o desenho do tipo quando ela não subiu
/// nenhuma (spec 2026-11-05).
///
/// No formato em que o dono subiu, como banner: comprida fica comprida, sem
/// círculo (José, 07/11/2026 — antes a quase quadrada virava redonda). O
/// upload já tirou o fundo liso e cortou rente ao desenho. `object-contain`
/// dentro de uma altura máxima, sem `rounded` e sem fundo.
///
/// Logo sem fundo próprio que sumiria no fundo da tela é repintada na cor de
/// destaque por `LogoAdaptada`.
///
/// `logo.src` é `/logo?v=…` nas telas do cliente (embutida, a data URL iria
/// duas vezes em cada página) e a própria data URL na prévia do painel.
/// `width`/`height` reais reservam o espaço: sem eles o cartaz pulava quando
/// a logo chegava.
export function LogoDaCasa({ logo, tipo, nome, altura, fundo, destaque }: {
  logo: LogoNaTela | null; tipo?: Tipo; nome: string; altura: number;
  /// Só a prévia do painel passa: o fundo dela não é o do `<html>`.
  fundo?: string; destaque?: string;
}) {
  if (!logo) {
    // O desenho do tipo continua com o tamanho que tinha na vitrine (96).
    return <Marca tipo={tipo} nome={nome} tamanho={Math.min(altura, 96)} className="rounded-wf mx-auto" />;
  }
  return (
    <LogoAdaptada src={logo.src} alt={`logo ${nome}`}
                  width={logo.largura ?? undefined} height={logo.altura ?? undefined}
                  style={{ maxHeight: altura }} fundo={fundo} destaque={destaque}
                  className="block mx-auto max-w-full w-auto h-auto object-contain" />
  );
}
