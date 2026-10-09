import { NextResponse } from 'next/server';
import { VERSAO_DO_APP } from '@/lib/versao';

/// Qual build está no ar agora. O aparelho compara com o dele
/// (`AvisoDeVersaoNova`).
///
/// Em `/versao` e não em `/api/versao`: em produção todo `/api/*` vai para o
/// Django (o rewrite do `next.config.ts`). Aqui não há risco de roubar o nome
/// de um estabelecimento, porque o estabelecimento é o subdomínio, não o
/// caminho.
///
/// `force-dynamic` e `no-store`: sem eles a resposta poderia sair de um cache
/// e continuar dizendo a versão antiga depois do deploy, que é exatamente o
/// que esta rota existe para desmentir.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ versao: VERSAO_DO_APP }, { headers: { 'Cache-Control': 'no-store' } });
}
