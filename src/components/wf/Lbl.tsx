export const Lbl = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`text-[11px] md:text-xs text-lbl uppercase tracking-[0.12em] ${className}`}>
    {children}
  </div>
);

export const Sub = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`text-[12px] md:text-[13px] text-sub ${className}`}>{children}</div>
);
