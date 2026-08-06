/// Servida quando o Host é o domínio nu — o proxy reescreve `/` para cá.
export default function Institucional() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 40, maxWidth: 560 }}>
      <h1>Agenda para barbearias</h1>
      <p>Seu cliente marca sozinho pelo celular. Você vê o dia inteiro numa tela.</p>
      <p>Cada barbearia tem o próprio endereço: <code>suabarbearia.seuapp.com.br</code></p>
    </main>
  );
}
