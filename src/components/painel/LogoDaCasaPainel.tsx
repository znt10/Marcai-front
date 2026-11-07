'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cartao, BotaoVazado, Texto, Titulo, Etiqueta, Pilula } from '@/components/painel/pecas';
import { LogoDaCasa } from '@/components/LogoDaCasa';
import { barbeariaApi, painelApi, mensagemDoErro, type DadosDaBarbearia } from '@/lib/api';
import { prepararLogo, ErroDeLogo, logoParaTela } from '@/lib/logo';
import { paleta, PAR_DA_PALETA, PALETAS, type Paleta } from '@/lib/paletas';

/// O bloco "Logo da casa" no alto da Equipe (spec 2026-11-05). Só o dono vê:
/// a página só monta isto no ramo dele, e o `PUT` recusa os outros.
///
/// A prévia é desenhada sobre o FUNDO DA PALETA DO CLIENTE, e não sobre o
/// fundo do painel: uma logo preta transparente some na Preto e amarelo, e o
/// dono precisa ver isso aqui, antes do cliente. Não há plaquinha atrás da
/// logo nas telas do cliente — decisão do José —, então este é o aviso.
export function LogoDaCasaPainel() {
  const [dados, setDados] = useState<DadosDaBarbearia | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const seletor = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const ctrl = new AbortController();
    barbeariaApi.ver(ctrl.signal)
      .then(setDados)
      .catch((e) => { if ((e as Error)?.name !== 'AbortError') setErro(mensagemDoErro(e)); });
    return () => ctrl.abort();
  }, []);

  async function gravar(obter: () => Promise<string | null>) {
    setErro('');
    setEnviando(true);
    try {
      const logo = await obter();
      await painelApi.definirLogo(logo);
      setDados((atual) => (atual ? { ...atual, logoUrl: logo } : atual));
    } catch (e) {
      setErro(e instanceof ErroDeLogo ? e.message : mensagemDoErro(e));
    } finally {
      setEnviando(false);
    }
  }

  const fundo = paleta(dados?.paleta).tokens.fundo;

  // A tela do cliente clara ou escura (07/11/2026): gente mais velha lê
  // melhor no claro. Só entre as duas da mesma cor; a cor é do admin.
  const atual = (dados?.paleta && dados.paleta in PAR_DA_PALETA ? dados.paleta : 'PRETO_AMARELO') as Paleta;
  const opcoes = [atual, PAR_DA_PALETA[atual]]
    .sort((a, b) => (PALETAS[a].esquema === 'dark' ? -1 : 1) - (PALETAS[b].esquema === 'dark' ? -1 : 1));
  async function trocarTela(nova: Paleta) {
    if (!dados || nova === atual) return;
    setErro('');
    setEnviando(true);
    try {
      await painelApi.definirPaleta(nova);
      setDados({ ...dados, paleta: nova });
      // O destaque e o chão do painel também vêm da paleta, pelo `<html>`
      // que o servidor monta: o refresh traz o painel na cor nova.
      router.refresh();
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Cartao className="flex flex-col gap-3">
      <Titulo>Logo da casa</Titulo>
      <div className="flex h-[120px] items-center justify-center rounded-[10px] p-3"
           style={{ background: fundo }}>
        {/* O MESMO componente das telas do cliente, com a data URL no lugar
            do endereço: redonda ou banner aparece aqui como lá. */}
        {dados && (
          <LogoDaCasa tipo={dados.tipo} nome={dados.nome} altura={96}
                      logo={(() => {
                        const l = logoParaTela(dados.logoUrl);
                        return l && dados.logoUrl ? { ...l, src: dados.logoUrl } : null;
                      })()} />
        )}
      </div>
      <Texto>Assim ela aparece para o cliente.</Texto>
      <div className="flex flex-col gap-1.5">
        <Etiqueta>tela do cliente</Etiqueta>
        <div className="flex gap-2" role="group" aria-label="Tela do cliente">
          {opcoes.map((p) => {
            const t = PALETAS[p].tokens;
            return (
              <Pilula key={p} ativo={p === atual} aria-pressed={p === atual}
                      disabled={!dados || enviando} onClick={() => void trocarTela(p)}>
                <span className="flex items-center gap-1.5">
                  {/* A amostra: o fundo da tela com o destaque por cima. */}
                  <span aria-hidden className="inline-grid size-4 place-items-center rounded-full border border-borda"
                        style={{ background: t.fundo }}>
                    <span className="size-1.5 rounded-full" style={{ background: t.acento }} />
                  </span>
                  {PALETAS[p].esquema === 'dark' ? 'escura' : 'clara'}
                </span>
              </Pilula>
            );
          })}
        </div>
      </div>
      <input ref={seletor} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
             onChange={(e) => {
               const arquivo = e.target.files?.[0];
               e.target.value = '';
               if (arquivo) void gravar(() => prepararLogo(arquivo, fundo));
             }} />
      <div className="flex gap-2">
        <BotaoVazado disabled={!dados || enviando} onClick={() => seletor.current?.click()}>
          {dados?.logoUrl ? 'trocar' : 'pôr logo'}
        </BotaoVazado>
        {dados?.logoUrl && (
          <BotaoVazado disabled={enviando} onClick={() => void gravar(async () => null)}>
            tirar
          </BotaoVazado>
        )}
      </div>
      {erro && <Texto className="!text-acento">{erro}</Texto>}
    </Cartao>
  );
}
