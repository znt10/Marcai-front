'use client';
import { useEffect, useState } from 'react';
import { Box, Chip, Lbl, Sub } from '@/components/wf';
import {
  adminApi, ignorarAborto, mensagemDoErro, type BarbeariaDaLista,
} from '@/lib/api';

/// Reexportado porque a tela do admin já importava o tipo daqui; a definição
/// mora junto das rotas, em `lib/api/adminAPI.ts`.
export type Barbearia = BarbeariaDaLista;

export function ListaBarbearias({ recarregarEm }: { recarregarEm?: number }) {
  const [barbearias, setBarbearias] = useState<Barbearia[]>([]);
  const [link, setLink] = useState('');
  const [erro, setErro] = useState('');

  const carregar = (signal?: AbortSignal) =>
    adminApi.barbearias(signal).then(setBarbearias).catch(ignorarAborto);

  // Aborta na limpeza: criar duas barbearias em seguida muda `recarregarEm`
  // duas vezes, e a resposta da primeira busca chegando depois da segunda
  // deixaria a lista sem a barbearia recém-criada.
  useEffect(() => {
    const ctrl = new AbortController();
    void carregar(ctrl.signal);
    return () => ctrl.abort();
  }, [recarregarEm]);

  async function alternar(b: Barbearia) {
    setErro('');
    try {
      await adminApi.alternarAtivo(b.id, !b.ativo);
      void carregar();
    } catch (e) {
      setErro(mensagemDoErro(e));
    }
  }

  /// Um clique só, sem confirmação — com uma ressalva que vale escrever: sair
  /// do plano com zap APAGA a instância da Evolution, e voltar dá um número
  /// novo, que o dono precisa reconectar lendo o QR. Não é destrutivo para a
  /// agenda, mas custa uma ida ao celular da barbearia.
  async function trocarPlano(b: Barbearia) {
    const proximo = b.plano === 'COM_ZAP' ? 'SEM_ZAP' : 'COM_ZAP';
    if (proximo === 'SEM_ZAP'
        && !confirm(`Tirar o WhatsApp de ${b.nome}? O número atual é desligado, e voltar exige ler o QR de novo.`)) {
      return;
    }
    setErro('');
    try {
      await adminApi.trocarPlano(b.id, proximo);
      void carregar();
    } catch (e) {
      setErro(mensagemDoErro(e));
    }
  }

  async function reemitir(b: Barbearia) {
    setErro(''); setLink('');
    try {
      setLink((await adminApi.reemitirConvite(b.id)).linkConvite);
    } catch (e) {
      setErro(mensagemDoErro(e));
    }
  }

  return (
    <>
      <Lbl>barbearias</Lbl>
      {barbearias.length === 0 && <Sub>nenhuma ainda</Sub>}
      {barbearias.map((b) => (
        <Box key={b.id} variante={b.ativo ? 'normal' : 'mut'}
             className="flex flex-wrap gap-2 justify-between items-center">
          <span>{b.nome} · <span className="text-lbl">{b.slug}</span></span>
          <Lbl>{b.barbeiros} barbeiros · {b.agendamentos} agendamentos</Lbl>
          <div className="flex gap-2 flex-wrap">
            {/* O plano é o que a barbearia PAGA, então ele aparece como
                estado (pastilha acesa/apagada) e não como verbo: o admin
                precisa ler quem tem zap correndo o olho pela lista, sem
                clicar em nada. */}
            <Chip ativo={b.plano === 'COM_ZAP'} onClick={() => trocarPlano(b)}>
              {b.plano === 'COM_ZAP' ? 'com zap' : 'sem zap'}
            </Chip>
            <Chip onClick={() => alternar(b)}>{b.ativo ? 'desativar' : 'reativar'}</Chip>
            <Chip acento onClick={() => reemitir(b)}>novo convite</Chip>
          </div>
        </Box>
      ))}
      {erro && <Sub className="text-acento">{erro}</Sub>}
      {link && (
        <Box variante="copia" className="break-all">
          <Sub>manda esse link pro dono — ele só aparece uma vez</Sub>
          {link}
        </Box>
      )}
      <Sub>desativar leva até um minuto para tirar a barbearia do ar</Sub>
    </>
  );
}
