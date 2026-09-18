/// As peças do painel — o vocabulário do redesign do Figma
/// ("Marcaí — Painel do Dono (redesign)").
///
/// Por que não reusar `@/components/wf`: aqueles primitivos falam a língua da
/// identidade do cliente — caixa alta, canto de 4px, a sombra sólida de
/// letreiro. O painel, no desenho novo, fala outra: caixa mista, canto de
/// 14px, sem sombra, e o peso da Poppins fazendo a hierarquia que lá é feita
/// pelo `tracking` e pelo tamanho. Vestir `Box` com exceções para os dois
/// mundos deixaria um primitivo com duas caras — e a segunda cara vazaria
/// para a vitrine no primeiro ajuste distraído.
///
/// As cores vêm todas de token (ver o bloco `.painel` em `globals.css`), e a
/// única medida literal aqui são os raios: 14px no cartão, 11px no botão que
/// conclui, 10px no botão pequeno. São o desenho, não um tema.

/// O cartão. Tudo que é lista no painel — horário, barbeiro, serviço, membro
/// da equipe — é uma fileira destes.
///
/// `sel` é o cartão do AGORA: fio de âmbar cheio em vez do fio discreto. Um
/// por tela, no máximo — é o que o olho procura ao abrir.
export function Cartao({
  variante = 'normal', className = '', children, ...props
}: {
  variante?: 'normal' | 'sel' | 'mut' | 'dash';
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const estilo = {
    normal: 'bg-superficie border-borda-suave',
    sel: 'bg-superficie border-acento',
    mut: 'bg-mut border-borda-suave',
    dash: 'bg-superficie border-acento-forte border-dashed',
  }[variante];
  return (
    <div className={`border rounded-[14px] p-4 ${estilo} ${className}`} {...props}>
      {children}
    </div>
  );
}

/// O cartão DENTRO do cartão — o "próximo livre" do quadro do dia. Um degrau
/// acima da superfície, sem fio: a borda aqui seria a terceira linha paralela
/// em 12px de altura.
export const CartaoInterno = ({ className = '', children }: {
  className?: string; children: React.ReactNode;
}) => (
  <div className={`bg-superficie2 rounded-[14px] p-3 ${className}`}>{children}</div>
);

/// A pastilha de escolher: barbeiro, motivo da folga, papel. Uma da fileira
/// fica acesa, e acesa quer dizer âmbar cheio com a tinta escura por cima —
/// o mesmo par do botão que conclui, em tamanho de rótulo.
export function Pilula({
  ativo = false, className = '', children, ...props
}: {
  ativo?: boolean;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`shrink-0 rounded-full px-3.5 py-2 text-[12px] font-semibold transition-colors
                  disabled:opacity-40
                  ${ativo
                    ? 'bg-acento text-no-acento'
                    : 'border border-borda text-sub hover:text-tinta'}
                  ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/// O botão que conclui — marcar, guardar, cadastrar. Âmbar cheio, canto de
/// 11px, e o texto em caixa mista: no Figma ele é uma frase ("+ marcar na
/// mão"), não uma etiqueta.
///
/// `largura="cheia"` é o do fim de formulário; o padrão acompanha o texto,
/// como o "+ marcar na mão" da agenda.
export function BotaoCheio({
  largura = 'natural', className = '', children, ...props
}: {
  largura?: 'natural' | 'cheia';
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`rounded-[11px] bg-acento px-6 py-[15px] text-center text-[14.5px] font-bold
                  text-no-acento transition-opacity hover:opacity-90
                  disabled:bg-mut disabled:text-lbl disabled:hover:opacity-100
                  ${largura === 'cheia' ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/// O botão pequeno de linha — "apagar", "promover", "tirar da lista". Só fio
/// e texto: são as ações que acompanham um item, e um segundo âmbar na mesma
/// linha do cartão brigaria com o que conclui.
export function BotaoVazado({
  className = '', children, ...props
}: {
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`shrink-0 rounded-[10px] border border-borda px-3 py-2 text-[11.5px]
                  font-semibold text-tinta transition-colors hover:border-acento
                  disabled:opacity-40 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/// O interruptor do dia de trabalho. Substitui o par de botões "abrir/fechar":
/// o estado passa a estar no próprio controle, e não na palavra ao lado dele.
///
/// É `button` com `role="switch"`, não uma caixa pintada: quem usa leitor de
/// tela ouve "ligado/desligado", e o teclado o alcança sem nada a mais.
export function Interruptor({
  ligado, rotulo, ...props
}: {
  ligado: boolean;
  rotulo: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      className={`flex h-6 w-[42px] shrink-0 items-center rounded-full border p-[3px]
                  transition-colors
                  ${ligado
                    ? 'justify-end border-acento bg-superficie2'
                    : 'justify-start border-borda bg-superficie2'}`}
      {...props}
    >
      <span
        aria-hidden
        className={`size-4 rounded-full transition-colors
                    ${ligado ? 'bg-acento-forte' : 'bg-lbl'}`}
      />
    </button>
  );
}

/// O cabeçalho de tela: o título grande e a linha que diz o que a tela faz.
///
/// A frase é parte do desenho, não enfeite — "Horários" sozinho não diz que
/// aquelas horas são as que o cliente enxerga.
export const TituloDaTela = ({ titulo, children }: {
  titulo: string; children?: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1.5 pb-1">
    <h1>{titulo}</h1>
    {children && <p className="max-w-[350px] text-[13px] font-medium text-sub">{children}</p>}
  </div>
);

/// O título de uma parte da tela — "Folgas e pausas", "A lista da barbearia".
/// Em caixa mista e peso 700: no painel novo quem separa seção do corpo é o
/// peso, não a caixa alta.
export const Titulo = ({ className = '', children }: {
  className?: string; children: React.ReactNode;
}) => (
  <h2 className={`text-[13.5px] font-bold text-tinta ${className}`}>{children}</h2>
);

/// O rótulo de um dado — "duração", "próximo livre". Pequeno, semibold, na
/// tinta mais apagada: ele existe para o número abaixo dele ser lido sem
/// adivinhação, e some assim que a pessoa aprendeu a tela.
export const Etiqueta = ({ className = '', children }: {
  className?: string; children: React.ReactNode;
}) => (
  <span className={`text-[10.5px] font-semibold text-lbl ${className}`}>{children}</span>
);

/// A frase de apoio. Mesmo papel do `Sub` do wireframe, na tipografia daqui.
export const Texto = ({ className = '', children }: {
  className?: string; children: React.ReactNode;
}) => (
  <p className={`text-[12.5px] font-medium text-sub ${className}`}>{children}</p>
);

/// O fio que separa duas partes da tela.
export const Fio = ({ className = '' }: { className?: string }) => (
  <div className={`h-px w-full bg-borda-suave ${className}`} />
);
