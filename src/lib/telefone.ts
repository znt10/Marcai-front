/// Normaliza um WhatsApp digitado à mão para os 10 ou 11 dígitos nacionais,
/// ou devolve `null` se o número não puder ser um telefone brasileiro.
/// O `null` é o contrato: quem chama decide a mensagem de erro.
export function normalizar(entrada: string): string | null {
  let d = (entrada ?? '').replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  // 11 dígitos só existe com o 9 na frente do número; sem isso é um fixo
  // com um dígito sobrando.
  if (d.length === 11 && d[2] !== '9') return null;
  return d;
}

export function formatar(digitos: string): string {
  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos[2]} ${digitos.slice(3, 7)}-${digitos.slice(7)}`;
  }
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
}
