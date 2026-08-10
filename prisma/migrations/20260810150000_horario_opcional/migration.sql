-- O admin da plataforma cadastra a barbearia; ele NÃO sabe o horário dela.
-- Quem sabe é o dono, e a tela dele já existe (`/painel/servicos`, a frase de
-- horário da home). Exigir o campo no cadastro era pedir para o admin inventar
-- um valor que o dono ia corrigir depois — ou pior, que ele não ia corrigir.
--
-- Nulo em vez de string vazia porque os dois estados são diferentes de verdade:
-- NULL é "a barbearia ainda não disse", e a home simplesmente não mostra
-- horário nenhum. String vazia seria a mesma coisa disfarçada de valor
-- preenchido, e a tela teria que adivinhar qual dos dois significa o quê.
ALTER TABLE "Barbearia" ALTER COLUMN "horarioResumo" DROP NOT NULL;
