'use client';
import { useEffect, useState } from 'react';
import { ListaBarbearias } from '@/components/admin/ListaBarbearias';
import { FormBarbearia } from '@/components/admin/FormBarbearia';
import { Sep, Lbl } from '@/components/wf';
import { adminApi, origemDoTenant, LOGIN_DO_ADMIN } from '@/lib/api';

export default function Admin() {
  // Criar uma barbearia tem que aparecer na lista sem F5. Um contador é o
  // suficiente: ele muda, o efeito da lista roda de novo.
  const [versao, setVersao] = useState(0);

  // O admin do Django mora no DJANGO — outra porta (8000), não esta (3000).
  // Sem este link ele existia sem ter entrada: funcionava, respondia, e a
  // única forma de chegar lá era digitar `admin.<domínio>:8000/admin/django/`
  // de cabeça. Foi assim que ele passou por "desativado" mesmo ligado.
  //
  // Em efeito, e não no `useState`: `origemDoTenant()` lê `window.location`,
  // que não existe quando o Next renderiza este Client Component no servidor.
  // Vazio até o efeito rodar, e o link só aparece depois — é um clique numa
  // tela que já exigiu login, não a primeira pintura de nada.
  const [urlDoDjango, setUrlDoDjango] = useState('');
  useEffect(() => { setUrlDoDjango(`${origemDoTenant()}/admin/django/`); }, []);

  async function sair() {
    await adminApi.sair();
    window.location.href = LOGIN_DO_ADMIN;
  }

  return (
    <>
      <ListaBarbearias recarregarEm={versao} />
      <Sep />
      <FormBarbearia aoCriar={() => setVersao((v) => v + 1)} />
      <Sep />
      <div className="flex justify-between items-baseline text-[10px] md:text-xs text-lbl">
        {/* `<a>` e não `<Link>`, a mesma exceção de `Confirmado`: isto SAI do
            app Next e vai para uma página servida pelo Django, noutra porta.
            Um `<Link>` tentaria navegar por dentro e daria 404. */}
        {urlDoDjango
          ? <a href={urlDoDjango}><Lbl>admin do django ›</Lbl></a>
          : <span />}
        <span className="cursor-pointer" onClick={sair}><Lbl>sair</Lbl></span>
      </div>
    </>
  );
}
