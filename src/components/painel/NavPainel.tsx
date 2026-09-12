'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { painelApi, mensagemDoErro } from '@/lib/api';
import { Avatar } from '@/components/wf';
import { prepararFoto, ErroDeFoto } from '@/lib/foto';
import { useEu } from '@/components/painel/SessaoDoPainel';
import { lembrar, esquecer } from '@/lib/eu-lembrado';
import { SECOES } from '@/components/painel/secoes';
import { SeletorDeSecao } from '@/components/painel/SeletorDeSecao';

/// A navegação do painel, uma só para as cinco telas.
///
/// Antes cada tela terminava em "← voltar para a agenda" e a agenda carregava
/// quatro caixas iguais às dos agendamentos. Ir de Horários a Serviços custava
/// três carregamentos de página, e a lista de links descia junto com a agenda:
/// num sábado cheio, "meus horários" ficava abaixo de doze clientes.
///
/// No desktop são abas no topo, lidas antes do conteúdo. No celular não cabem
/// seis abas de `flex-1` numa linha de 360px, e a barra fixa do rodapé que
/// fazia esse papel cobria a última linha de toda tela — virou um botão com a
/// seção atual, em `SeletorDeSecao`.
///
/// O item ativo ganha a barra sólida de latão, não uma pílula nem um brilho: é
/// o mesmo gesto de letreiro pintado que `--shadow-sel` já usa no resto do
/// produto — sombra sólida, sem desfoque.
///
/// Cada seção é `<Link>` do Next, não `<a>`: preserva o layout ao trocar de
/// tela, não remonta o cabeçalho, reduz `eu()` a uma sessão só.
function Abas({ caminho, dono }: { caminho: string; dono: boolean }) {
  return (
    <>
      {SECOES.filter((s) => !s.soDono || dono).map((s) => {
        const ativo = caminho === s.href;
        return (
          <Link key={s.href} href={s.href} aria-current={ativo ? 'page' : undefined}
             className={`relative min-w-0 flex-1 py-2.5 text-center font-letreiro text-sm
                         uppercase tracking-[0.06em]
                         ${ativo ? 'text-acento' : 'text-sub hover:text-tinta'}`}>
            {/* Reforço, nunca o único sinal: quem não distingue o âmbar do
                cinza tem o `aria-current` e a própria barra. */}
            {ativo && (
              <span aria-hidden className="absolute inset-x-3 bottom-0 h-[3px] bg-latao" />
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
function Espaco() {
  return <span aria-hidden className="flex-1 invisible py-2.5 text-sm">·</span>;
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
      // A cópia lembrada também: sem isto, a próxima carga de página pintaria
      // por um instante a foto ANTIGA — o pisca de volta, só que pior, porque
      // mostraria dado errado em vez de dado nenhum.
      if (eu) lembrar({ ...eu, fotoUrl: pronta });
    } catch (e) {
      setErroFoto(e instanceof ErroDeFoto ? e.message : mensagemDoErro(e));
    }
  }

  async function sair() {
    // O painel não tinha saída: `painelApi.sair()` existia e não era chamada de
    // lugar nenhum. Num aparelho de balcão, isso é a sessão do dono aberta para
    // quem pegar o telefone.
    await painelApi.sair().catch(() => {});
    // Esquece ANTES de sair da página: num aparelho de balcão, o nome e a
    // foto do dono não podem sobrar no navegador depois que ele saiu. O
    // cookie já morreu no servidor, então isto não é o que protege a conta —
    // é não deixar o rastro de quem estava aqui.
    esquecer();
    window.location.href = '/painel/login';
  }

  // Sangra de borda a borda: é cromo da página, e não um bloco de conteúdo.
  // Centrar num `max-w` menor faria a barra brigar com a largura do conteúdo,
  // que muda de tela para tela (560, e 1100 no quadro do dia).
  return (
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
            sumia da lista até a resposta chegar. A barra nascia com 4 abas
            e virava 5 quando `painelApi.eu()` respondia; como cada aba é
            `flex-1`, a largura de TODAS mudava junto, e a barra sólida do
            item ativo saltava de posição — o "pulo" relatado como "foi
            para outra aba e voltou". Aqui a lista só desenha depois de
            saber `dono` de verdade; `Espaco` reserva a altura antes disso,
            para a página não pular por baixo. */}
        <nav aria-label="Seções do painel" className="hidden md:flex">
          {carregando ? <Espaco /> : <Abas caminho={caminho} dono={dono} />}
        </nav>
        <SeletorDeSecao caminho={caminho} dono={dono} carregando={carregando} />
      </div>
    </div>
  );
}
