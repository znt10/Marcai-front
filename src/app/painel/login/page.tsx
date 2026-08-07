import { Frame } from '@/components/wf';
import { FormLoginBarbeiro } from '@/components/painel/FormLoginBarbeiro';

export default function LoginDoPainel() {
  return (
    <Frame>
      <h1 className="text-[17px] font-normal">Painel</h1>
      <FormLoginBarbeiro />
    </Frame>
  );
}
