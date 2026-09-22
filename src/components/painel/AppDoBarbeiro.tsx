'use client';
import { useEffect, useState } from 'react';

/// O que transforma o painel num app instalado no celular do barbeiro.
///
/// Duas coisas moram aqui, e as duas só dentro do painel: o registro do
/// service worker (`public/sw.js`) e o botão que oferece a instalação.
///
/// Só no painel porque o app é da EQUIPE. O cliente chega por um link do
/// WhatsApp, marca o horário e vai embora — oferecer a ele um ícone na tela
/// inicial seria pedir espaço permanente por uma visita a cada trinta dias.
type PedidoDeInstalar = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function AppDoBarbeiro() {
  const [pedido, setPedido] = useState<PedidoDeInstalar | null>(null);

  useEffect(() => {
    // `load`, e não na montagem: o service worker disputaria banda com a
    // primeira tela, e num 3G de rua isso atrasa o que a pessoa veio ver.
    const registrar = () => {
      navigator.serviceWorker?.register('/sw.js').catch(() => {
        // Sem service worker o painel continua inteiro — o que se perde é o
        // convite para instalar e a tela de "sem conexão". Não é erro para
        // mostrar a quem está tentando ver a agenda.
      });
    };
    if (document.readyState === 'complete') registrar();
    else window.addEventListener('load', registrar);
    return () => window.removeEventListener('load', registrar);
  }, []);

  useEffect(() => {
    // O navegador dispara isto quando decide que o app é instalável, e o
    // `preventDefault` guarda o pedido para o nosso botão — sem ele, o Chrome
    // mostra a barrinha dele, que aparece embaixo, cobre conteúdo e some
    // sozinha antes de alguém entender o que era.
    function guardar(e: Event) {
      e.preventDefault();
      setPedido(e as PedidoDeInstalar);
    }
    window.addEventListener('beforeinstallprompt', guardar);
    // Instalado por fora (pelo menu do navegador), o botão some sem recarregar.
    const instalou = () => setPedido(null);
    window.addEventListener('appinstalled', instalou);
    return () => {
      window.removeEventListener('beforeinstallprompt', guardar);
      window.removeEventListener('appinstalled', instalou);
    };
  }, []);

  // Nada a oferecer: ou já está instalado, ou é um navegador que não instala
  // (o iPhone só instala pelo "Adicionar à Tela de Início" do próprio Safari),
  // ou a pessoa acabou de recusar. Em nenhum desses casos há botão.
  if (!pedido) return null;

  return (
    <button
      onClick={async () => {
        await pedido.prompt();
        // Uma vez respondido, o pedido não serve de novo — o navegador manda
        // outro depois, se ainda fizer sentido. Guardar este seria um botão
        // que não faz nada no segundo toque.
        setPedido(null);
      }}
      className="shrink-0 rounded-[8px] border border-borda px-2 py-1 text-[11.5px]
                 lg:rounded-[10px] lg:px-3 lg:py-1.5 lg:text-[14.5px]
                 font-semibold text-sub hover:border-acento hover:text-acento"
    >
      instalar
    </button>
  );
}
