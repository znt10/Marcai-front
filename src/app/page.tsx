import { Frame, Box, Chip, Row, Lbl, Sub, Sep, Avatar, StatusBar } from '@/components/wf';

/// Vitrine provisória dos primitivos (Tarefa 11). A Tarefa 16 troca esta
/// página pela tela principal do cliente.
export default function Vitrine() {
  return (
    <Frame>
      <StatusBar />
      <Lbl>Lbl — rótulo de campo</Lbl>
      <Sub>Sub — texto de apoio</Sub>
      <Sep />
      <Box>Box normal</Box>
      <Box variante="dash">Box dash — estado vazio</Box>
      <Box variante="fill">Box fill — ação principal</Box>
      <Box variante="sel">Box sel — escolhido</Box>
      <Box variante="mut">Box mut — indisponível</Box>
      <Sep />
      <Row wrap>
        <Chip>Chip</Chip>
        <Chip ativo>Chip ativo</Chip>
        <Chip acento>Chip acento</Chip>
        <Chip disabled>Chip off</Chip>
      </Row>
      <Row>
        <Box>metade</Box>
        <Box>metade</Box>
      </Row>
      <Sep />
      <Row wrap className="items-center">
        <Avatar />
        <Avatar tamanho={40} />
      </Row>
    </Frame>
  );
}
