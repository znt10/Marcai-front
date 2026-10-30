import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Política de Privacidade · Marcaí' };

/// A política que a Meta exige para publicar o app da API do WhatsApp
/// (Configurações do app > Básico). Sem tenant, como a institucional: abre
/// em `usemarcai.online/privacidade` e em qualquer subdomínio.
export default function Privacidade() {
  return (
    <main className="[font-family:system-ui] mx-auto max-w-[680px] px-6 py-10 md:px-10 md:py-16 leading-relaxed">
      <h1 className="text-2xl font-bold">Política de Privacidade</h1>
      <p className="mt-2 text-sm opacity-70">Atualizada em 30 de outubro de 2026</p>

      <p className="mt-6">
        O Marcaí é um sistema de agendamento online para barbearias, salões e outros negócios de
        atendimento. Esta política explica quais dados tratamos, para quê e quais são os seus direitos,
        nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018).
      </p>

      <h2 className="mt-8 text-lg font-bold">Quem é o responsável</h2>
      <p className="mt-2">
        JOSE CICERO DA SILVA NETO, CNPJ 64.445.662/0001-58, São Mamede/PB. Contato:{' '}
        <a className="underline" href="mailto:jc970807@gmail.com">jc970807@gmail.com</a>.
      </p>

      <h2 className="mt-8 text-lg font-bold">Quais dados tratamos</h2>
      <ul className="mt-2 list-disc pl-5">
        <li>De quem agenda: nome, número de WhatsApp e os horários marcados.</li>
        <li>De quem trabalha no estabelecimento: nome, número de WhatsApp e dados de acesso ao painel.</li>
        <li>Dados técnicos: endereço IP e informações do navegador, usados para segurança e para evitar abuso.</li>
      </ul>

      <h2 className="mt-8 text-lg font-bold">Para que usamos</h2>
      <ul className="mt-2 list-disc pl-5">
        <li>Registrar o agendamento e mostrá-lo ao estabelecimento escolhido.</li>
        <li>Enviar pelo WhatsApp a confirmação, o lembrete e avisos sobre o horário marcado.</li>
        <li>Enviar à equipe do estabelecimento a agenda do dia e avisos de novos horários e cancelamentos.</li>
      </ul>
      <p className="mt-2">Não enviamos propaganda e não vendemos dados a ninguém.</p>

      <h2 className="mt-8 text-lg font-bold">Com quem compartilhamos</h2>
      <ul className="mt-2 list-disc pl-5">
        <li>Com o estabelecimento em que você agendou, que é quem presta o serviço.</li>
        <li>Com a Meta (WhatsApp Business Platform), apenas para entregar as mensagens.</li>
        <li>Com o provedor de hospedagem dos servidores e com o meio de pagamento, quando houver cobrança.</li>
      </ul>

      <h2 className="mt-8 text-lg font-bold">Por quanto tempo guardamos</h2>
      <p className="mt-2">
        Enquanto o estabelecimento usar o Marcaí, para manter o histórico de atendimentos. Você pode
        pedir a exclusão a qualquer momento.
      </p>

      <h2 className="mt-8 text-lg font-bold">Seus direitos</h2>
      <p className="mt-2">
        Você pode pedir acesso, correção ou exclusão dos seus dados, ou deixar de receber mensagens, pelo
        e-mail acima. Também pode simplesmente responder &quot;parar&quot; no WhatsApp ou pedir ao
        estabelecimento. Respondemos em até 15 dias.
      </p>

      <h2 className="mt-8 text-lg font-bold">Segurança</h2>
      <p className="mt-2">
        Os dados ficam em servidores com acesso restrito, a conexão é criptografada (HTTPS) e cada
        estabelecimento só enxerga os próprios agendamentos.
      </p>
    </main>
  );
}
