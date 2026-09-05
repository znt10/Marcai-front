'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { painelApi, mensagemDoErro } from '@/lib/api';
import { Avatar } from '@/components/wf';
import { prepararFoto, ErroDeFoto } from '@/lib/foto';
import { useEu } from '@/components/painel/SessaoDoPainel';

/// A navegação do painel, uma só para as cinco telas.
///
/// Antes cada tela terminava em "← voltar para a agenda" e a agenda carregava
/// quatro caixas iguais às dos agendamentos. Ir de Horários a Serviços custava
/// três carregamentos de página, e a lista de links descia junto com a agenda:
/// num sábado cheio, "meus horários" ficava abaixo de doze clientes.
///
/// No celular ela mora EMBAIXO — onde o polegar de quem segura o aparelho com
/// uma mão só alcança sem trocar a pegada, e o painel é usado de pé, ao lado
/// da cadeira. No desktop sobe para o topo, onde a barra de seções é lida
/// antes do conteúdo.
///
/// O item ativo ganha a barra sólida de latão, não uma pílula nem um brilho: é
/// o mesmo gesto de letreiro pintado que `--shadow-sel` já usa no resto do
/// produto — sombra sólida, sem desfoque.
type Secao = { href: string; rotulo: string; soDono?: boolean };

const SECOES: Secao[] = [
  { href: '/painel', rotulo: 'agenda' },
  { href: '/painel/dia', rotulo: 'quadro' },
  { href: '/painel/horarios', rotulo: 'horários' },
  { href: '/painel/servicos', rotulo: 'serviços' },
  { href: '/painel/equipe', rotulo: 'equipe', soDono: true },
];

function Abas({ caminho, dono, embaixo }: { caminho: string; dono: boolean; embaixo?: boolean }) {
  return (
    <>
      {SECOES.filter((s) => !s.soDono || dono).map((s) => {
        const ativo = caminho === s.href;
        return (
          <Link key={s.href} href={s.href} aria-current={ativo ? 'page' : undefined}
             className={`relative flex-1 text-center font-letreiro uppercase tracking-[0.06em]
                         ${embaixo ? 'py-3 text-[13px]' : 'py-2.5 text-sm'}
                         ${ativo ? 'text-acento' : 'text-sub hover:text-tinta'}`}>
            {/* Link do Next: preserva o layout, não remonta o cabeçalho, reduz
                `eu()` a uma sessão. */}
            {/* Reforço, nunca o único sinal: quem não distingue o âmbar do
                cinza tem o `aria-current` e a própria barra. */}
            {ativo && (
              <span aria-hidden
                    className={`absolute inset-x-3 h-[3px] bg-latao ${embaixo ? 'top-0' : 'bottom-0'}`} />
            )}
            {s.rotulo}
          </Link>
        );
      })}
    </>
  );
}

/// Fica no lugar de `Abas` enquanto `dono` ainda não é confiável (ver
/// `carregando` em `NavPainel`). Mesma altura de uma aba de verdade
/// (`py`/`text` iguais), conteúdo invisível: a barra reserva o espaço sem
/// desenhar nada que possa estar errado.
function Espaco({ embaixo }: { embaixo?: boolean }) {
  return (
    <span aria-hidden className={`flex-1 invisible ${embaixo ? 'py-3 text-[13px]' : 'py-2.5 text-sm'}`}>
      ·
    </span>
  );
}

export function NavPainel() {
  const caminho = usePathname();
  // `eu` vem do provider montado no layout, não de uma busca própria: era
  // aqui que uma das seis buscas independentes de `painelApi.eu()` vivia.
  // Ver `SessaoDoPainel.tsx` para a busca em si.
  const { eu, carregando, setEu } = useEu();
  const [erroFoto, setErroFoto] = useState('');
  const seletor = useRef<HTMLInputElement>(null);
  const naEntrada = caminho === '/painel/login';

  if (naEntrada) return null;

  const dono = eu?.papel === 'DONO';

  async function trocarFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    setErroFoto('');
    try {
      // Recorta e reduz AQUI: a foto de câmera tem megabytes, e o que vai para
      // o banco tem ~6 KB. O servidor confere de novo — cliente é conveniência.
      const pronta = await prepararFoto(arquivo);
      await painelApi.definirFoto(pronta);
      setEu((atual) => (atual ? { ...atual, fotoUrl: pronta } : atual));
    } catch (e) {
      setErroFoto(e instanceof ErroDeFoto ? e.message : mensagemDoErro(e));
    }
  }

  async function sair() {
    // O painel não tinha saída: `painelApi.sair()` existia e não era chamada de
    // lugar nenhum. Num aparelho de balcão, isso é a sessão do dono aberta para
    // quem pegar o telefone.
    await painelApi.sair().catch(() => {});
    window.location.href = '/painel/login';
  }

  return (
    <>
      {/* Sangra de borda a borda: é cromo da página, e não um bloco de
          conteúdo. Centrar num `max-w` menor faria a barra brigar com a
          largura do conteúdo, que muda de tela para tela (560, e 1100 no
          quadro do dia). */}
      <div className="border-b border-borda bg-superficie">
        <div className="mx-auto max-w-[1100px] px-5 sm:px-7 md:px-10">
          <div className="flex items-baseline justify-between gap-3 py-3">
            <div className="min-w-0 flex items-center gap-2">
              {/* O círculo É o botão: não há tela de perfil no painel, e criar
                  uma para um campo só seria mais uma seção para quem já achou
                  o produto confuso. */}
              {eu && (
                <>
                  <input ref={seletor} type="file" accept="image/*" className="sr-only"
                         onChange={(e) => { void trocarFoto(e.target.files?.[0]); e.target.value = ''; }} />
                  <button onClick={() => seletor.current?.click()} className="shrink-0 rounded-full"
                          aria-label={eu.fotoUrl ? 'Trocar sua foto' : 'Pôr sua foto'}>
                    <Avatar tamanho={30} fotoUrl={eu.fotoUrl} nome={eu.nome} />
                  </button>
                </>
              )}
              <span className="font-letreiro uppercase tracking-[0.08em] text-sm md:text-base truncate">
                {eu?.nome ?? ' '}
              </span>
              {eu && (
                <span className="text-[10px] md:text-[11px] text-lbl uppercase tracking-[0.12em] shrink-0">
                  {dono ? 'dono' : 'barbeiro'}
                </span>
              )}
            </div>
            <button onClick={sair} className="text-[11px] md:text-xs text-lbl hover:text-acento shrink-0">
              sair
            </button>
          </div>
          {erroFoto && <div className="text-[12px] text-acento pb-2">{erroFoto}</div>}
          {/* Enquanto `carregando`, `dono` seria um palpite (sempre `false`,
              porque `eu` ainda é `null`) — e a aba "equipe" (`soDono: true`)
              somia da lista até a resposta chegar. A barra nascia com 4 abas
              e virava 5 quando `painelApi.eu()` respondia; como cada aba é
              `flex-1`, a largura de TODAS mudava junto, e a barra sólida do
              item ativo saltava de posição — o "pulo" relatado como "foi
              para outra aba e voltou". Aqui a lista só desenha depois de
              saber `dono` de verdade; `Espaco` reserva a altura antes disso,
              para a página não pular por baixo. */}
          <nav aria-label="Seções do painel" className="hidden md:flex">
            {carregando ? <Espaco /> : <Abas caminho={caminho} dono={dono} />}
          </nav>
        </div>
      </div>

      {/* `env(safe-area-inset-bottom)`: no iPhone a faixa do gesto de início
          come a última linha, e o rótulo ativo fica sob o risco branco. */}
      <nav aria-label="Seções do painel"
           className="md:hidden fixed bottom-0 inset-x-0 z-20 flex border-t border-borda
                      bg-superficie pb-[env(safe-area-inset-bottom)]">
        {carregando ? <Espaco embaixo /> : <Abas caminho={caminho} dono={dono} embaixo />}
      </nav>
    </>
  );
}
