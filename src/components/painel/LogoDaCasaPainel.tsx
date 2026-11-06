'use client';
import { useEffect, useRef, useState } from 'react';
import { Cartao, BotaoVazado, Texto, Titulo } from '@/components/painel/pecas';
import { LogoDaCasa } from '@/components/LogoDaCasa';
import { barbeariaApi, painelApi, mensagemDoErro, type DadosDaBarbearia } from '@/lib/api';
import { prepararLogo, ErroDeLogo, logoParaTela } from '@/lib/logo';
import { paleta } from '@/lib/paletas';

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
