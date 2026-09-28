/// O IP de quem chamou, para o Django contar o limite por IP e a trava de
/// login do admin.
///
/// O ÚLTIMO de `x-forwarded-for`, e não o primeiro. Cada proxy ACRESCENTA ao
/// fim da lista, então o começo é o que o cliente quiser escrever: com o
/// primeiro, bastava mandar um `x-forwarded-for` novo a cada pedido para
/// nunca bater no limite. Em produção há exatamente um proxy antes do Next (o
/// Traefik do Coolify), e o último da lista é o endereço que ele viu. Se um
/// dia entrar outro na frente (Cloudflare, por exemplo), isto muda junto.
export function ipDoCliente(headers: Headers): string | undefined {
  const ultimo = headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return ultimo || undefined;
}
