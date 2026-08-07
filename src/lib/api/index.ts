/// Ponto de entrada da camada de API. Página e componente importam **daqui**,
/// nunca escrevem caminho de rota à mão.

export { pedir, ErroApi, ignorarAborto, mensagemDoErro } from './client';
export type { Pedido, Busca } from './client';

export { publicoApi } from './publicoAPI';
export type {
  Barbeiro, Servico, Slot, DiaComSlots, NovoAgendamento,
} from './publicoAPI';

export { painelApi, equipeApi, LOGIN_DO_PAINEL } from './painelAPI';
export type { Eu, ItemDaAgenda, MembroDaEquipe, NovoBarbeiro } from './painelAPI';

export { adminApi, LOGIN_DO_ADMIN } from './adminAPI';
export type { BarbeariaDaLista, NovaBarbearia } from './adminAPI';
