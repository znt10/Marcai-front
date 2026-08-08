import { Frame, Lbl } from '@/components/wf';

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return (
    <Frame largo>
      <div className="flex justify-between items-baseline">
        <h1>admin</h1>
        <Lbl>plataforma</Lbl>
      </div>
      {children}
    </Frame>
  );
}
