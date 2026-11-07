import type { Tipo } from '@/lib/tipos';
import { Marca } from '@/components/Marca';
import type { LogoNaTela } from '@/lib/logo';

/// A logo da casa em destaque, ou o desenho do tipo quando ela não subiu
/// nenhuma (spec 2026-11-05).
///
/// No formato em que o dono subiu: comprida fica comprida, redonda fica
/// redonda. Por isso `object-contain` dentro de uma altura máxima, sem
/// `rounded` e sem fundo — uma moldura forçada transformaria a logo comprida
/// num retângulo colado na tela, o mesmo incômodo que levou ao tema Rosé.
///
/// Quadrada vira REDONDA, como a foto dos profissionais; comprida (banner)
/// fica como veio, para não cortar o nome escrito nela (José, 06/11/2026).
/// Quem decide é `logoParaTela`, pelas medidas reais da imagem.
///
/// `logo.src` é `/logo?v=…` nas telas do cliente (embutida, a data URL iria
/// duas vezes em cada página) e a própria data URL na prévia do painel.
/// `width`/`height` reais reservam o espaço: sem eles o cartaz pulava quando
/// a logo chegava.
///
/// Sem hook: serve à vitrine e à Equipe (Client) e ao agendado (Server).
export function LogoDaCasa({ logo, tipo, nome, altura }: {
  logo: LogoNaTela | null; tipo?: Tipo; nome: string; altura: number;
}) {
  if (!logo) {
    // O desenho do tipo continua com o tamanho que tinha na vitrine (96).
    return <Marca tipo={tipo} nome={nome} tamanho={Math.min(altura, 96)} className="rounded-wf mx-auto" />;
  }
  if (logo.redonda) {
    // Pequena não é esticada: o círculo fica do tamanho dela.
    const lado = Math.min(altura, logo.largura ?? altura, logo.altura ?? altura);
    return (
      <img src={logo.src} alt={`logo ${nome}`} width={lado} height={lado}
           style={{ width: lado, height: lado }}
           className="block mx-auto shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <img src={logo.src} alt={`logo ${nome}`}
         width={logo.largura ?? undefined} height={logo.altura ?? undefined}
         style={{ maxHeight: altura }}
         className="block mx-auto max-w-full w-auto h-auto object-contain" />
  );
}
