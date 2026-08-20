'use client';
import { useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';
import { adminApi, mensagemDoErro, type NovaBarbearia } from '@/lib/api';

/// Seis campos. O **horário** não está entre eles porque o admin não sabe o
/// horário da barbearia — pedir era pedir para ele inventar um valor, e o dono
/// já tem a tela para escrever a frase da home.
///
/// **`donoEmail` é o campo da fatia 3, e é o motivo daquela fatia existir.**
/// Antes, o login do dono ERA o `whatsappContato` da barbearia, então trocar o
/// telefone público derrubava o acesso dele. São duas coisas diferentes e
/// agora são duas colunas diferentes — o que só serve para alguma coisa se a
/// tela pedir as duas.
///
/// Ele ficou faltando aqui quando a fatia 3 passou a exigi-lo no Django, e o
/// efeito era total: NENHUMA barbearia podia ser criada. O back recusava com
/// 422 "Faltou preencher algum campo.", que na tela parecia erro de quem
/// digitou — o formulário estava visivelmente cheio. Apareceu na travessia da
/// fatia 5, que é a primeira vez que alguém percorreu o cadastro inteiro.
const CAMPOS = [
  { chave: 'slug',            rotulo: 'slug (vira o subdomínio)' },
  { chave: 'nome',            rotulo: 'nome da barbearia' },
  { chave: 'endereco',        rotulo: 'endereço' },
  { chave: 'whatsappContato', rotulo: 'WhatsApp da barbearia' },
  { chave: 'donoNome',        rotulo: 'nome do dono' },
  { chave: 'donoEmail',       rotulo: 'e-mail do dono (vira o login dele)' },
] as const;

/// Trava de compilacao: se `NovaBarbearia` ganhar um campo e `CAMPOS` nao,
/// isto para de compilar. Nao cobre tudo — o campo que faltou de verdade
/// (`donoEmail`) nasceu no Django, e nenhum tipo daqui sabe disso — mas cobre
/// a metade que da para cobrir sem sair do repositorio, que e o formulario
/// divergir do corpo que ele mesmo declara mandar.
type _CamposQueFaltam = Exclude<keyof NovaBarbearia, (typeof CAMPOS)[number]['chave']>;
const _formularioCobreONovaBarbearia: _CamposQueFaltam extends never ? true : never = true;
void _formularioCobreONovaBarbearia;

export function FormBarbearia({ aoCriar }: { aoCriar?: () => void }) {
  const [dados, setDados] = useState<Record<string, string>>({});
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
      const criada = await adminApi.criarBarbearia(dados as unknown as NovaBarbearia);
      setLink(criada.linkConvite);
      setDados({});
      aoCriar?.();
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Lbl>nova barbearia</Lbl>
      {CAMPOS.map((c) => (
        <Box key={c.chave} variante={dados[c.chave] ? 'normal' : 'dash'}>
          <input className="w-full outline-none bg-transparent" placeholder={c.rotulo}
                 value={dados[c.chave] ?? ''}
                 // Forma funcional, e nao `{ ...dados }`: aquela fecha sobre o
                 // `dados` do render, entao duas mudancas antes do proximo
                 // commit se sobrescrevem e ficam so' com a ultima. O caso
                 // real e o autofill do Chrome, que preenche os cinco de uma
                 // vez — o formulario aparecia cheio na tela e o back recusava
                 // com "Faltou preencher algum campo".
                 onChange={(e) => setDados((d) => ({ ...d, [c.chave]: e.target.value }))} />
        </Box>
      ))}
      {erro && <Sub className="text-acento">{erro}</Sub>}
      <Box variante={completo ? 'fill' : 'mut'}
           className={completo ? 'cursor-pointer' : ''} onClick={criar}>
        {enviando ? 'criando…' : 'criar barbearia'}
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
          <Sub>mandamos esse link no WhatsApp da barbearia também</Sub>
        </>
      )}
    </>
  );
}
