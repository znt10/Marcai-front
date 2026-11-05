import type { Tipo } from '@/lib/tipos';
import { Marca } from '@/components/Marca';

/// A logo da casa em destaque, ou o desenho do tipo quando ela não subiu
/// nenhuma (spec 2026-11-05).
///
/// No formato em que o dono subiu: comprida fica comprida, redonda fica
/// redonda. Por isso `object-contain` dentro de uma altura máxima, sem
/// `rounded` e sem fundo — uma moldura forçada transformaria a logo comprida
/// num retângulo colado na tela, o mesmo incômodo que levou ao tema Rosé.
///
/// `src` é o endereço `/logo?v=…` (`srcDaLogo`), nunca a data URL: embutida,
/// ela iria duas vezes em cada página.
///
/// Sem hook: serve à vitrine (Client Component) e ao agendado (Server).
export function LogoDaCasa({ src, tipo, nome, altura }: {
  src: string | null; tipo?: Tipo; nome: string; altura: number;
}) {
  if (!src) {
    // O desenho do tipo continua com o tamanho que tinha na vitrine (96).
    return <Marca tipo={tipo} nome={nome} tamanho={Math.min(altura, 96)} className="rounded-wf mx-auto" />;
  }
  return (
    <img src={src} alt={`logo ${nome}`} style={{ maxHeight: altura }}
         className="block mx-auto max-w-full w-auto h-auto object-contain" />
  );
}
