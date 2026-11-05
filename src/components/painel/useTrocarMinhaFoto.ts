'use client';
import { useState } from 'react';
import { painelApi, mensagemDoErro } from '@/lib/api';
import { prepararFoto, ErroDeFoto } from '@/lib/foto';
import { useEu } from '@/components/painel/SessaoDoPainel';
import { lembrar } from '@/lib/eu-lembrado';

/// Trocar e tirar a PRÓPRIA foto. Saiu do `NavPainel` quando a tela Equipe
/// ganhou o bloco "Sua foto" (spec 2026-11-05): os dois lugares mexem na
/// mesma foto, e cada um com uma cópia da lógica acabaria com um deles
/// esquecendo de atualizar o `eu` lembrado.
export function useTrocarMinhaFoto() {
  const { eu, setEu } = useEu();
  const [erro, setErro] = useState('');

  async function gravar(foto: string | null) {
    await painelApi.definirFoto(foto);
    setEu((atual) => (atual ? { ...atual, fotoUrl: foto } : atual));
    // A cópia lembrada também: sem isto, a próxima carga de página pintaria
    // por um instante a foto ANTIGA — o pisca de volta, só que pior, porque
    // mostraria dado errado em vez de dado nenhum.
    if (eu) lembrar({ ...eu, fotoUrl: foto });
  }

  async function trocar(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro('');
    try {
      // Recorta e reduz AQUI: a foto de câmera tem megabytes, e o que vai para
      // o banco tem ~6 KB. O servidor confere de novo — cliente é conveniência.
      await gravar(await prepararFoto(arquivo));
    } catch (e) {
      setErro(e instanceof ErroDeFoto ? e.message : mensagemDoErro(e));
    }
  }

  async function tirar() {
    setErro('');
    try {
      await gravar(null);
    } catch (e) {
      setErro(mensagemDoErro(e));
    }
  }

  return { trocar, tirar, erro };
}
