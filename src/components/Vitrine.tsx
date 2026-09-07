'use client';
import { useState } from 'react';
import { Box, Lbl, Sub, Avatar } from '@/components/wf';
import { formatarPreco } from '@/lib/dinheiro';
import type { CardapioDoBarbeiro } from '@/lib/vitrine';

/// O cartaz da barbearia e a tabela de preços, e a ponte entre os dois: o
/// barbeiro escolhido.
///
/// ## Por que os dois moram no MESMO componente
///
/// A grade de rostos fica dentro do cartaz e a lista de preços fica fora
/// dele. Quem escolhe está numa; quem responde está na outra — e o estado
/// tem que ficar acima das duas. Por isso o cartaz inteiro veio para cá em
/// vez de a lista virar um componente sozinha.
///
/// ## Por que Client Component, se a página é servida no servidor
///
/// A página continua buscando tudo no servidor e passando pronto: o React
/// também renderiza este componente lá, então o HTML já chega com o primeiro
/// barbeiro e os preços dele — nada pisca, e um robô de busca lê a tabela.
/// O `'use client'` paga só pela troca, que acontece SEM rede: os cardápios
/// dos quatro já vieram juntos.
///
/// ## Por que uma lista por vez, e não as quatro empilhadas
///
/// A versão anterior mostrava um bloco por barbeiro, um debaixo do outro.
/// Com quatro barbeiros e três serviços, são doze linhas de preço numa tela
/// que devia responder "quanto custa um corte aqui". Escolhendo o rosto, a
/// resposta é sempre três linhas — e comparar dois barbeiros é um toque.
export function Vitrine({
  endereco, horarioResumo, cardapios,
}: {
  endereco: string;
  horarioResumo: string | null;
  cardapios: CardapioDoBarbeiro[];
}) {
  // O primeiro da equipe, e não "nenhum": a seção de preços existir vazia
  // esperando um clique é uma tela que não respondeu à pergunta. A ordem da
  // equipe vem do back e começa no dono.
  const [escolhido, setEscolhido] = useState(cardapios[0]?.barbeiro.id ?? '');
  const atual = cardapios.find((c) => c.barbeiro.id === escolhido) ?? cardapios[0];

  return (
    <>
      <Box className="flex flex-col items-center gap-3 pt-6 pb-5 md:pt-7 text-center">
        <img src="/marca.png" alt="" width={96} height={96} className="rounded-wf" />

        {/* A frase é do PRODUTO, não desta barbearia: não há campo para ela no
            banco, então toda barbearia diz o mesmo. Quando existir uma
            manchete por barbearia, é aqui que ela entra. */}
        <p className="font-letreiro uppercase font-semibold leading-[1.05]
                      tracking-[0.02em] text-[26px] md:text-[34px] text-tinta">
          Corte de homem,<br />hora marcada.
        </p>

        <div className="flex flex-col gap-0.5">
          <Sub>{endereco}</Sub>
          {/* Nulo até o dono escrever a frase. Sem a condição, sobraria uma
              linha vazia no meio do cartaz. */}
          {horarioResumo && <Sub>{horarioResumo}</Sub>}
        </div>

        {/* Dentro do cartaz, como no desenho: a equipe é parte da
            apresentação da casa, não uma seção à parte. Some junto com o
            resto numa barbearia recém-criada, que ainda não tem ninguém. */}
        {cardapios.length > 0 && (
          <div className="w-full flex flex-col gap-2 mt-3 text-left">
            <Lbl>barbeiros</Lbl>
            <div className="grid grid-cols-3 gap-2">
              {cardapios.map(({ barbeiro }) => {
                const ativo = barbeiro.id === atual?.barbeiro.id;
                return (
                  <Box key={barbeiro.id} variante={ativo ? 'sel' : 'normal'}
                       role="button" tabIndex={0} aria-pressed={ativo}
                       onClick={() => setEscolhido(barbeiro.id)}
                       // Enter e espaço, porque isto é um `div` com papel de
                       // botão: sem eles a tabela de preços seria inalcançável
                       // por teclado.
                       onKeyDown={(e) => {
                         if (e.key === 'Enter' || e.key === ' ') {
                           e.preventDefault();
                           setEscolhido(barbeiro.id);
                         }
                       }}
                       className="flex flex-col items-center gap-2 py-3 cursor-pointer
                                  transition-colors">
                    {/* O rosto é o que a vitrine tem para mostrar de quem
                        trabalha na casa — 38px era um selo ao lado do nome,
                        não uma apresentação. 72 é o que cabe na coluna da
                        grade de três num telefone de 390px. */}
                    <Avatar tamanho={72} fotoUrl={barbeiro.fotoUrl} nome={barbeiro.nome} />
                    <span className="text-[13px]">{barbeiro.nome}</span>
                  </Box>
                );
              })}
            </div>
          </div>
        )}
      </Box>

      {atual && (
        <div className="flex flex-col gap-2">
          {/* O nome no rótulo é o que impede a leitura errada. Sem ele a
              tabela parece o preço DA CASA, e nesta barbearia o dono cobra
              R$ 22,00 onde os outros cobram R$ 40,00 — quem marcasse com
              outro pagaria quase o dobro do que a fachada prometeu. Era
              exatamente esse o defeito: a tela usava `barbeiroId=qualquer`,
              o sentinela do MENOR preço, e não dizia de quem era. */}
          <Lbl>serviços com {atual.barbeiro.nome}</Lbl>

          {atual.servicos.length === 0 ? (
            // Acontece de verdade: barbeiro recém-convidado, ainda sem preço
            // definido. Dizer isso é melhor que uma seção que some — some, e
            // quem clicou acha que o clique não funcionou.
            <Sub>ainda sem preços cadastrados — chama no zap pra combinar</Sub>
          ) : (
            atual.servicos.map((s) => (
              <Box key={s.id} className="flex items-baseline justify-between gap-3">
                <span>
                  {s.nome}{' '}
                  <span className="font-dado text-[11px] text-lbl">{s.duracaoMin}min</span>
                </span>
                {/* Nulo enquanto ESTE barbeiro não definiu preço para o
                    serviço. Some o preço, não a linha: "faço barba, preço a
                    combinar" é informação; sumir com a barba esconde que ele
                    faz. */}
                {s.precoCentavos !== null && (
                  <span className="font-dado text-acento shrink-0">
                    {formatarPreco(s.precoCentavos)}
                  </span>
                )}
              </Box>
            ))
          )}
        </div>
      )}
    </>
  );
}
