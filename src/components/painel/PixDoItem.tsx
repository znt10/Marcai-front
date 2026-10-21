'use client';
import { useState } from 'react';
import { BotaoCheio, Texto } from '@/components/painel/pecas';
import { mensagemDoErro, painelApi } from '@/lib/api';
import { rotuloDoPix, textoDaConfirmacaoRecebi, type BlocoPix } from '@/lib/pix';

/// O estado do Pix de um horário: a frase de cada estado e, quando o dinheiro
/// ainda não foi confirmado, o "Recebi". O 409 do back (horário pego, já
/// começou) vem em frase pronta e fica na tela — some sozinho só se o
/// barbeiro tentar de novo.
export function PixDoItem({ id, pix, aoConfirmar, compacto = false }: {
  id: string; pix: BlocoPix | null | undefined; aoConfirmar: () => void; compacto?: boolean;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const rotulo = rotuloDoPix(pix);
  if (!pix || !rotulo) return null;

  async function recebi() {
    if (!confirm(textoDaConfirmacaoRecebi(pix!.valorCentavos))) return;
    setErro(''); setOcupado(true);
    try {
      await painelApi.recebi(id);
      aoConfirmar();
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setOcupado(false);
    }
  }

  const pendente = pix.estado !== 'pago';
  const cor = pix.estado === 'pago' ? 'text-livre'
    : pix.estado === 'expirado' ? 'text-lbl' : 'text-acento-forte';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={`${compacto ? 'text-[11.5px]' : 'text-[12.5px]'} font-semibold ${cor}`}>
          {rotulo}
        </span>
        {pendente && (
          <BotaoCheio onClick={recebi} disabled={ocupado}
                      className="!px-4 !py-2 !text-[12.5px] md:!px-4 md:!py-2 md:!text-[13px]">
            {ocupado ? 'Confirmando…' : 'Recebi'}
          </BotaoCheio>
        )}
      </div>
      {erro && <div role="alert"><Texto className="text-acento">{erro}</Texto></div>}
    </div>
  );
}
