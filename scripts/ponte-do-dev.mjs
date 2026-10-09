// Só de dev: roda dentro do contêiner do front, ao lado do `next dev`
// (ver `docker-compose.yml`).
//
// Em dev, `buscarNoDjango()` (src/lib/tenant.ts) chama
// `http://<slug>.localhost:8000`. De dentro do contêiner, um nome
// `*.localhost` sem apelido na rede do compose aponta para o próprio
// contêiner — e aqui ninguém escutava na 8000: estabelecimento novo criado
// pelo admin dava 500 até alguém pôr o nome dele no compose do back.
//
// Esta ponte escuta na 8000 do contêiner e repassa os bytes, sem tocar em
// nada, para o Django (`api:8000`). O Host do pedido segue sendo
// `<slug>.localhost`, então o Django acha o estabelecimento como sempre — e
// qualquer slug novo já funciona, sem lista nenhuma.
import net from 'node:net';

const DESTINO_HOST = process.env.PONTE_DESTINO_HOST || 'api';
const DESTINO_PORTA = Number(process.env.PONTE_DESTINO_PORTA || 8000);
const PORTA = Number(process.env.NEXT_PUBLIC_API_URL || 8000);

net
  .createServer((cliente) => {
    const django = net.connect(DESTINO_PORTA, DESTINO_HOST);
    cliente.pipe(django).pipe(cliente);
    // Um lado caiu: fecha o outro, e o erro não derruba a ponte inteira.
    cliente.on('error', () => django.destroy());
    django.on('error', () => cliente.destroy());
  })
  // Sem host: escuta em IPv4 e IPv6. `jose.localhost` resolve primeiro
  // para ::1 aqui dentro.
  .listen(PORTA, () => console.log(`[ponte] :${PORTA} -> ${DESTINO_HOST}:${DESTINO_PORTA}`));
