/// O service worker do painel — o mínimo, de propósito.
///
/// Ele existe por duas razões, e nenhuma delas é cache:
///
/// 1. Sem um service worker com tratador de `fetch`, o Chrome no Android não
///    oferece "instalar aplicativo". O manifesto sozinho não basta.
/// 2. Aberto instalado e sem sinal, o app precisa dizer o que houve — senão o
///    barbeiro vê a tela de dinossauro do navegador dentro de um ícone que
///    tem o nome da barbearia dele, e conclui que o produto quebrou.
///
/// O que ele NÃO faz: guardar resposta de API. A agenda deste painel muda a
/// cada horário marcado, e servir uma cópia velha dela é pior que não abrir —
/// um barbeiro atendendo com a lista de ontem dá o horário a duas pessoas. Por
/// isso toda navegação vai à rede, sempre, e o cache guarda só a página de
/// "sem conexão".
const CACHE = 'marcai-v1';
const SEM_CONEXAO = '/offline.html';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.add(SEM_CONEXAO)).then(() => self.skipWaiting()),
  );
});

/// Limpa as versões antigas do cache e assume o controle das abas abertas, em
/// vez de esperar a próxima. Sem isto, trocar a página de "sem conexão" só
/// valeria depois que o barbeiro fechasse o app.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  // Só navegação. Imagem, script e chamada de API passam direto para a rede —
  // o navegador já tem cache próprio para o que é estático, e a API não pode
  // ter.
  if (e.request.mode !== 'navigate') return;

  e.respondWith(
    fetch(e.request).catch(() => caches.match(SEM_CONEXAO)),
  );
});
