export const Lbl = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`text-[11px] md:text-xs text-lbl ${className}`}>{children}</div>
);

export const Sub = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`text-[11px] md:text-xs text-sub ${className}`}>{children}</div>
);
