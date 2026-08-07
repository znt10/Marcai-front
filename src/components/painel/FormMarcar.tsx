'use client';
import { useEffect, useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';
import { GRANULARIDADE_MIN, PAINEL_ANTECEDENCIA_PADRAO_MIN } from '@/lib/config';
import {
  painelApi, publicoApi, ignorarAborto, mensagemDoErro, ErroApi,
  type Barbeiro, type Servico, type Slot,
} from '@/lib/api';

/// O caso do balcão: o cliente está ali e quer o próximo horário. O padrão
/// economiza toque; não é regra — os dois campos continuam trocáveis.
function padraoDeHorario() {
  const d = new Date(Date.now() + PAINEL_ANTECEDENCIA_PADRAO_MIN * 60_000);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / GRANULARIDADE_MIN) * GRANULARIDADE_MIN);
  return d;
}

export function FormMarcar({ eu }: { eu: { id: string; papel: 'DONO' | 'BARBEIRO' } }) {
  // O dono marca para qualquer um da equipe; o barbeiro, só para si. Não é
  // decisão da tela: a rota responde 404 para o BARBEIRO que mandar o id de um
  // colega. Aqui o seletor só some — um controle com uma opção só é ruído.
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  const [barbeiroId, setBarbeiroId] = useState(eu.id);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [servicoId, setServicoId] = useState('');
  const [dia, setDia] = useState(padraoDeHorario().toLocaleDateString('sv-SE'));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [inicio, setInicio] = useState('');
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  /// Todo efeito daqui aborta ao sair. O de horários é o que mais importa:
  /// trocar de barbeiro ou de dia rápido deixa buscas sobrepostas no ar, e a
  /// última a responder pintaria a lista — dando para escolher um horário que
  /// pertence a outro barbeiro.
  useEffect(() => {
    if (eu.papel !== 'DONO') return;
    const ctrl = new AbortController();
    publicoApi.barbeiros(ctrl.signal).then(setBarbeiros).catch(ignorarAborto);
    return () => ctrl.abort();
  }, [eu.papel]);

  // O primeiro da lista já vem escolhido — é o serviço mais comum da casa.
  // Refeito quando o barbeiro muda: nem todos fazem os mesmos serviços, e um
  // serviço que ficasse escolhido sem vínculo daria "esse barbeiro não faz
  // esse serviço" no envio, sem a tela ter dado pista nenhuma.
  useEffect(() => {
    const ctrl = new AbortController();
    publicoApi.servicos(barbeiroId, ctrl.signal)
      .then((s) => {
        setServicos(s);
        setServicoId((atual) => (s.some((x) => x.id === atual) ? atual : s[0]?.id ?? ''));
      })
      .catch(ignorarAborto);
    return () => ctrl.abort();
  }, [barbeiroId]);

  useEffect(() => {
    if (!servicoId) return;
    const ctrl = new AbortController();
    publicoApi.horarios({ barbeiroId, servicoId, de: dia, dias: 1 }, ctrl.signal)
      .then((dias) => {
        const livres = dias[0]?.slots ?? [];
        setSlots(livres);
        const alvo = padraoDeHorario().toISOString();
        setInicio(livres.find((s) => s.inicio >= alvo)?.inicio ?? livres[0]?.inicio ?? '');
      })
      .catch(ignorarAborto);
    return () => ctrl.abort();
  }, [servicoId, dia, barbeiroId, recarga]);

  const pronto = servicoId && inicio && nome.trim().length >= 2 && whatsapp && !enviando;

  async function marcar() {
    if (!pronto) return;
    setEnviando(true); setErro('');
    try {
      await painelApi.marcar({ barbeiroId, servicoId, inicio, nome, whatsapp });
      window.location.href = '/painel';
    } catch (e) {
      setErro(mensagemDoErro(e));
      setEnviando(false);
      // 409 é horário que acabou de ser pego: recarregar a lista é o conserto.
      if (e instanceof ErroApi && e.status === 409) setRecarga((n) => n + 1);
    }
  }

  return (
    <>
      {barbeiros.length > 1 && (
        <>
          <Lbl>barbeiro</Lbl>
          <div className="flex flex-wrap gap-2">
            {barbeiros.map((b) => (
              <Box key={b.id} variante={b.id === barbeiroId ? 'fill' : 'normal'}
                   className="cursor-pointer" onClick={() => setBarbeiroId(b.id)}>
                {b.id === eu.id ? `${b.nome} (você)` : b.nome}
              </Box>
            ))}
          </div>
        </>
      )}

      <Lbl>serviço</Lbl>
      <div className="flex flex-wrap gap-2">
        {servicos.map((s) => (
          <Box key={s.id} variante={s.id === servicoId ? 'fill' : 'normal'}
               className="cursor-pointer" onClick={() => setServicoId(s.id)}>
            {s.nome}
          </Box>
        ))}
      </div>

      <Lbl>dia</Lbl>
      <Box>
        <input type="date" className="w-full outline-none bg-transparent"
               value={dia} onChange={(e) => setDia(e.target.value)} />
      </Box>

      <Lbl>hora</Lbl>
      {slots.length === 0 && <Sub>nenhum horário livre neste dia.</Sub>}
      <div className="flex flex-wrap gap-2">
        {slots.map((s) => (
          <Box key={s.inicio} variante={s.inicio === inicio ? 'fill' : 'normal'}
               className="cursor-pointer" onClick={() => setInicio(s.inicio)}>
            {s.hora}
          </Box>
        ))}
      </div>

      <Lbl>cliente</Lbl>
      <Box variante={nome ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" placeholder="nome"
               value={nome} onChange={(e) => setNome(e.target.value)} />
      </Box>
      <Box variante={whatsapp ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" placeholder="whatsapp"
               inputMode="numeric"
               value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
      </Box>

      {erro && <Sub className="text-acento">{erro}</Sub>}
      <Box variante={pronto ? 'fill' : 'mut'}
           className={pronto ? 'cursor-pointer' : ''} onClick={marcar}>
        {enviando ? 'marcando…' : 'marcar'}
      </Box>
      <a href="/painel"><Box>← voltar para a agenda</Box></a>
    </>
  );
}
