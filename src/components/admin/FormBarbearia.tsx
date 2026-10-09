'use client';
import { useState } from 'react';
import { Box, Chip, Lbl, Sub } from '@/components/wf';
import { adminApi, mensagemDoErro, type NovaBarbearia } from '@/lib/api';
import { PALETAS, PALETAS_EM_ORDEM, PALETA_PADRAO, type Paleta } from '@/lib/paletas';
import { vocabulario, type Tipo, type Vocabulario } from '@/lib/tipos';

/// Cinco campos, e os dois que saíram têm motivos diferentes.
///
/// **Horário** saiu porque o admin não sabe o horário da barbearia. Pedir era
/// pedir para ele inventar um valor — e o dono já tem a tela para escrever a
/// frase da home.
///
/// **WhatsApp do dono** saiu porque no cadastro é a mesma pessoa do contato da
/// barbearia: eram dois campos para digitar o mesmo número. O número da
/// barbearia vira o login do dono, e ele separa depois pela tela de equipe.
///
/// Os rótulos seguem o tipo escolhido acima deles ("nome do estúdio").
const camposDo = (v: Vocabulario) => [
  { chave: 'slug',            rotulo: 'slug (vira o subdomínio)' },
  { chave: 'nome',            rotulo: `nome ${v.doLugar}` },
  { chave: 'endereco',        rotulo: 'endereço' },
  { chave: 'whatsappContato', rotulo: `WhatsApp ${v.doLugar}` },
  { chave: 'donoNome',        rotulo: 'nome do dono' },
] as const;

/// O tipo vem da CATEGORIA em que o admin entrou (`/admin/sobrancelha`), e
/// não de um seletor aqui: cada categoria cria os seus (pedido de 09/10).
export function FormBarbearia({ tipo, aoCriar }: { tipo: Tipo; aoCriar?: () => void }) {
  const [dados, setDados] = useState<Record<string, string>>({});
  // A paleta (spec 2026-10-08) começa na sugerida pelo tipo: `null` quer
  // dizer "a sugerida", até o admin tocar numa.
  const [paletaEscolhida, setPaletaEscolhida] = useState<Paleta | null>(null);
  const paleta = paletaEscolhida ?? PALETA_PADRAO[tipo];
  const v = vocabulario(tipo);
  const CAMPOS = camposDo(v);
  const [erro, setErro] = useState('');
  const [link, setLink] = useState('');
  const [enviando, setEnviando] = useState(false);

  const completo = CAMPOS.every((c) => (dados[c.chave] ?? '').trim()) && !enviando;

  async function criar() {
    if (!completo) return;
    setEnviando(true); setErro(''); setLink('');
    try {
      // Os cinco campos de CAMPOS são exatamente os de NovaBarbearia, e o
      // botão só habilita com todos preenchidos.
      const criada = await adminApi.criarBarbearia({
        ...(dados as unknown as NovaBarbearia), tipo, paleta,
      });
      setLink(criada.linkConvite);
      setDados({});
      setPaletaEscolhida(null);
      aoCriar?.();
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Lbl>novo estabelecimento</Lbl>
      <Sub>cores</Sub>
      <div className="flex flex-wrap gap-2">
        {PALETAS_EM_ORDEM.map((p) => (
          <Chip key={p} ativo={paleta === p} aria-pressed={paleta === p}
                onClick={() => setPaletaEscolhida(p)} className="inline-flex items-center gap-1.5">
            <Amostra paleta={p} />{PALETAS[p].nome}
          </Chip>
        ))}
      </div>
      {CAMPOS.map((c) => (
        <Box key={c.chave} variante={dados[c.chave] ? 'normal' : 'dash'}>
          <input className="w-full outline-none bg-transparent" placeholder={c.rotulo}
                 value={dados[c.chave] ?? ''}
                 onChange={(e) => setDados({ ...dados, [c.chave]: e.target.value })} />
        </Box>
      ))}
      {erro && <Sub className="text-acento">{erro}</Sub>}
      <Box variante={completo ? 'fill' : 'mut'}
           className={completo ? 'cursor-pointer' : ''} onClick={criar}>
        {enviando ? 'criando…' : `criar ${v.lugar}`}
      </Box>
      {link && (
        <>
          <Box variante="copia" className="break-all">
            <Sub>link de convite do dono — só aparece uma vez</Sub>
            {link}
          </Box>
          {/* Duas vias: a tela mostra uma vez e o zap guarda. Dizer isso aqui
              importa porque muda o que o admin faz — não precisa copiar o link
              correndo com medo de perder. */}
          <Sub>mandamos esse link no WhatsApp {v.doLugar} também</Sub>
        </>
      )}
    </>
  );
}

/// O fundo e o destaque da paleta, lado a lado: o nome sozinho ("Branco e
/// rosé") não mostra QUAL rosé.
function Amostra({ paleta }: { paleta: Paleta }) {
  const { fundo, acento } = PALETAS[paleta].tokens;
  return (
    <span aria-hidden className="inline-flex overflow-hidden rounded-full border border-borda">
      <span className="size-3" style={{ background: fundo }} />
      <span className="size-3" style={{ background: acento }} />
    </span>
  );
}
