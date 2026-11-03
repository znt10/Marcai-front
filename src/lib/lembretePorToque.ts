/// Lembrete por toque (Marcai-back, spec 2026-11-03): o cliente toca em
/// "Quero o lembrete no WhatsApp", o WhatsApp abre com esta mensagem para o
/// número central, e só quem manda recebe a confirmação e o lembrete de 1h
/// antes — de graça, porque foi ele quem escreveu primeiro.
///
/// O texto é o MESMO de `lembrete_por_toque.texto_pronto` no back. O back
/// procura só o código, então o cliente pode apagar o resto.

export function textoProntoDoLembrete(barbeariaNome: string, codigo: string): string {
  return `Quero o lembrete do meu horário na ${barbeariaNome}. Código: ${codigo}`;
}

/// `central` em dígitos nacionais (`83988982852`), como vem em
/// `whatsappCentral` de GET /api/barbearia.
export function linkDoLembrete(central: string, barbeariaNome: string, codigo: string): string {
  return `https://wa.me/55${central}?text=${encodeURIComponent(textoProntoDoLembrete(barbeariaNome, codigo))}`;
}
