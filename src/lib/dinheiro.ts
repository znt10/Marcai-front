/// Formata centavos como "R$ 45,00" (pt-BR). O banco guarda centavos —
/// inteiro, sem ponto flutuante — pelo mesmo motivo de sempre: R$ 0,10 +
/// R$ 0,20 em float não bate R$ 0,30. Formatar é o ÚNICO lugar onde a
/// conversão pra reais acontece, e só pra exibir.
export function formatarPreco(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    centavos / 100,
  );
}
