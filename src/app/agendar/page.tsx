import Link from 'next/link';
import { barbeariaAtual } from '@/lib/tenant';
import { Frame, Sub, Sep } from '@/components/wf';
import { FormAgendamento } from '@/components/FormAgendamento';

export async function generateMetadata() {
  const b = await barbeariaAtual();
  return { title: `Marcar horário · ${b.nome}` };
}

export default async function Agendar({
  searchParams,
}: { searchParams: Promise<{ barbeiroId?: string; servicoId?: string; inicio?: string }> }) {
  const b = await barbeariaAtual();
  // A volta do calendário chega por aqui. Ler no servidor e passar como prop
  // evita useSearchParams() e a fronteira de Suspense que ele exigiria.
  const { barbeiroId, servicoId, inicio } = await searchParams;

  return (
    <Frame largo>
      <h1>
        {b.nome} <span className="text-[11px] md:text-sm text-sub">barbearia</span>
      </h1>
      {/* O horário é nulo até o dono escrever a frase dele. Sem a condição,
          sairia "Rua Aurora, 88 · " com o separador pendurado. */}
      <Sub>{b.endereco}{b.horarioResumo ? ` · ${b.horarioResumo}` : ''}</Sub>
      <Sep />
      <FormAgendamento inicial={{ barbeiroId, servicoId, inicio }} />
      <Sep />
      <div className="text-[10px] md:text-xs text-lbl text-center">
        <Link href="/">‹ a barbearia</Link>
      </div>
    </Frame>
  );
}
