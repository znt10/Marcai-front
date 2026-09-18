'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { painelApi, mensagemDoErro } from '@/lib/api';
import { prepararFoto, ErroDeFoto } from '@/lib/foto';
import { useEu } from '@/components/painel/SessaoDoPainel';
import { lembrar, esquecer } from '@/lib/eu-lembrado';
import { SECOES } from '@/components/painel/secoes';
import { SeletorDeSecao } from '@/components/painel/SeletorDeSecao';
import { FaixaDoWhatsapp } from '@/components/painel/FaixaDoWhatsapp';
import { BotaoDeTema } from '@/components/painel/Tema';
import { AppDoBarbeiro } from '@/components/painel/AppDoBarbeiro';

/// A navegação do painel, uma só para as seis telas.
///
/// Antes cada tela terminava em "← voltar para a agenda" e a agenda carregava
/// quatro caixas iguais às dos agendamentos. Ir de Horários a Serviços custava
/// três carregamentos de página, e a lista de links descia junto com a agenda:
/// num sábado cheio, "meus horários" ficava abaixo de doze clientes.
///
/// No desktop são abas no topo, lidas antes do conteúdo. No celular a barra
/// fixa do rodapé que fazia esse papel cobria a última linha de toda tela —
/// virou um botão com a seção atual, em `SeletorDeSecao`. O Figma desenha as
/// seis abas também no celular; o dropdown fica por decisão de quem usa o
/// painel no balcão, e é a única parte desta barra que não segue o desenho.
///
/// A aba acesa é âmbar com um traço curto de 16px por baixo — no redesign o
/// traço não atravessa mais a aba inteira: encurtado, ele marca o rótulo em
/// vez de sublinhar a coluna.
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
             className="flex w-[65px] flex-col items-center justify-center gap-1 py-2.5">
            {/* Reforço, nunca o único sinal: quem não distingue o âmbar do
                cinza tem o `aria-current` e o próprio traço. */}
            <span className={`text-[9.5px] font-semibold capitalize
                              ${ativo ? 'text-acento-forte' : 'text-lbl hover:text-sub'}`}>
              {s.rotulo}
            </span>
            <span aria-hidden className={`h-[2.5px] w-4 rounded-[2px]
                                          ${ativo ? 'bg-acento-forte' : 'bg-transparent'}`} />
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
  return <span aria-hidden className="invisible w-[65px] py-2.5 text-[9.5px]">·</span>;
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
    <div className="bg-fundo">
      <div className="mx-auto max-w-[1100px] px-5 sm:px-7 md:px-10">
        <div className="flex h-14 items-center justify-between gap-3 border-b border-borda-suave">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* A marca do Figma é um quadrado âmbar com a inicial. Aqui ela
                É o botão da foto: não há tela de perfil no painel, e criar
                uma para um campo só seria mais uma seção para quem já achou
                o produto confuso. Com foto, o quadrado vira a foto — mesmo
                lugar, mesmo tamanho, mesmo canto. */}
            {eu && (
              <>
                <input ref={seletor} type="file" accept="image/*" className="sr-only"
                       onChange={(e) => { void trocarFoto(e.target.files?.[0]); e.target.value = ''; }} />
                <button onClick={() => seletor.current?.click()}
                        className="size-[30px] shrink-0 overflow-hidden rounded-[8px] bg-acento"
                        aria-label={eu.fotoUrl ? 'Trocar sua foto' : 'Pôr sua foto'}>
                  {eu.fotoUrl
                    ? <img src={eu.fotoUrl} alt="" className="size-full object-cover" />
                    : <span className="flex size-full items-center justify-center text-[15px]
                                       font-black text-no-acento">
                        {eu.nome.trim().charAt(0).toUpperCase() || 'M'}
                      </span>}
                </button>
              </>
            )}
            <span className="truncate text-[14px] font-bold text-tinta">
              {eu?.nome ?? ' '}
            </span>
            {eu && (
              <span className="shrink-0 rounded-[5px] border border-borda px-[7px] py-[3px]
                               text-[9.5px] font-semibold tracking-[0.57px] text-lbl">
                {dono ? 'Dono' : 'Barbeiro'}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {/* Só aparece quando o navegador diz que dá para instalar, e some
                depois de instalado. Aqui em cima porque é onde a pessoa já
                olha para sair — e porque no meio da agenda seria propaganda. */}
            <AppDoBarbeiro />
            {/* Claro ou escuro. Ao lado do "sair" e na mesma voz dele: são as
                duas coisas da barra que não são navegação, e nenhuma das duas
                merece mais peso que o nome da pessoa. */}
            <BotaoDeTema />
            <button onClick={sair} className="text-[12.5px] font-medium text-sub hover:text-acento">
              sair
            </button>
          </div>
        </div>
        {erroFoto && <div className="py-2 text-[12px] text-acento">{erroFoto}</div>}
        {/* Enquanto `carregando`, `dono` seria um palpite (sempre `false`,
            porque `eu` ainda é `null`) — e a aba "equipe" (`soDono: true`)
            sumia da lista até a resposta chegar. A barra nascia com 4 abas
            e virava 6 quando `painelApi.eu()` respondia, e o traço do item
            ativo saltava de posição — o "pulo" relatado como "foi para outra
            aba e voltou". Aqui a lista só desenha depois de saber `dono` de
            verdade; `Espaco` reserva a altura antes disso. */}
        <nav aria-label="Seções do painel"
             className="hidden justify-center border-b border-borda-suave md:flex">
          {carregando ? <Espaco /> : <Abas caminho={caminho} dono={dono} />}
        </nav>
        <SeletorDeSecao caminho={caminho} dono={dono} carregando={carregando} />
        {/* DEPOIS da navegação, e dentro da barra: é aviso de estado, não
            uma seção — no topo ela empurraria nome e abas para baixo toda vez
            que o vínculo caísse, e o painel mudaria de forma por causa de uma
            coisa que some sozinha. Ela mesma não desenha nada quando está
            tudo de pé. */}
        <FaixaDoWhatsapp />
      </div>
    </div>
  );
}
