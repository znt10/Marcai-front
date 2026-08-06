/// Barra de status falsa do wireframe — puramente decorativa. Some no
/// desktop: "9:41 ▮▮▮" desenha um celular, e não há celular nenhum ali.
export const StatusBar = () => (
  <div className="flex justify-between text-[9px] text-apagado [font-family:system-ui] md:hidden">
    <span>9:41</span><span>▮▮▮</span>
  </div>
);
