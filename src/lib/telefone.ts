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

/// Os DDDs que existem de verdade. `normalizar` aceita a faixa 11..99 inteira,
/// que tem 89 números e só 67 são DDD — 20, 23, 25, 26, 29, 30, 60, 70, 72,
/// 76, 78 e 90 não existem, e são justamente os erros de digitação mais
/// comuns (21 virando 20, 83 virando 30).
///
/// Lista fechada e não regra: não há fórmula. A Anatel já criou DDD novo (o 66
/// saiu do 65 em 2000) e pode criar outro; quando criar, é esta linha que muda.
///
/// Espelha `DDDS` de `tenant/telefone.py`. Divergir daqui é um botão que
/// acende com um número que a API vai recusar — ou o contrário, pior.
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,          // SP
  21, 22, 24,                                   // RJ
  27, 28,                                       // ES
  31, 32, 33, 34, 35, 37, 38,                   // MG
  41, 42, 43, 44, 45, 46,                       // PR
  47, 48, 49,                                   // SC
  51, 53, 54, 55,                               // RS
  61,                                           // DF/GO
  62, 64,                                       // GO
  63,                                           // TO
  65, 66,                                       // MT
  67,                                           // MS
  68,                                           // AC
  69,                                           // RO
  71, 73, 74, 75, 77,                           // BA
  79,                                           // SE
  81, 87,                                       // PE
  82,                                           // AL
  83,                                           // PB
  84,                                           // RN
  85, 88,                                       // CE
  86, 89,                                       // PI
  91, 93, 94,                                   // PA
  92, 97,                                       // AM
  95,                                           // RR
  96,                                           // AP
  98, 99,                                       // MA
]);

/// Os 11 dígitos de um CELULAR brasileiro, ou `null`.
///
/// Mais estrita que `normalizar`, e de propósito — são duas perguntas
/// diferentes. `normalizar` responde "isto pode ser um telefone?", e serve ao
/// login e ao cadastro da equipe, onde fixo é contato legítimo. Esta responde
/// "isto pode ter WhatsApp?", e serve ao agendamento público, onde o produto
/// inteiro depende de mandar mensagem: confirmação, lembrete, link de
/// cancelar. Fixo nunca tem WhatsApp, então um agendamento com fixo nasce sem
/// nenhum dos três — e ninguém descobre até o cliente não aparecer.
export function celular(entrada: string | null | undefined): string | null {
  const d = normalizar(entrada ?? '');
  if (d === null || d.length !== 11) return null;
  if (!DDDS.has(Number(d.slice(0, 2)))) return null;
  return d;
}
