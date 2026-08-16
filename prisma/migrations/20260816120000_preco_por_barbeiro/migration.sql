-- Preço por serviço, decidido POR BARBEIRO — não pelo catálogo. Ao
-- contrário de duracaoMin (que herda um piso de duracaoMinimaMin/
-- duracaoSugeridaMin do Servico), preço não tem sugestão nenhuma pra
-- herdar: quem cobra é o barbeiro, e um recém-chegado cobra diferente de um
-- sênior. Por isso mora só em BarbeiroServico, nunca em Servico.
--
-- Nulável de propósito, mesmo raciocínio de horarioResumo
-- (20260810150000_horario_opcional): o vínculo nasce sem preço — quando o
-- barbeiro liga o serviço, ou nos vínculos que já existem hoje — e o
-- barbeiro preenche quando quiser. Marcar não pode passar a exigir preço:
-- a barbearia funciona sem ele desde sempre.
ALTER TABLE "BarbeiroServico" ADD COLUMN "precoCentavos" INTEGER;
ALTER TABLE "BarbeiroServico" ADD CONSTRAINT barbeiro_servico_preco_valido
  CHECK ("precoCentavos" IS NULL OR "precoCentavos" > 0);

-- Snapshot no Agendamento, mesma razão de servicoNome/duracaoMin
-- (comentário do model): o preço de um agendamento passado não pode mudar
-- se o barbeiro reprecificar depois. Copiado do vínculo no momento de
-- marcar — nulo quando o barbeiro não tinha preço definido naquela hora.
ALTER TABLE "Agendamento" ADD COLUMN "precoCentavos" INTEGER;
ALTER TABLE "Agendamento" ADD CONSTRAINT agendamento_preco_valido
  CHECK ("precoCentavos" IS NULL OR "precoCentavos" > 0);
