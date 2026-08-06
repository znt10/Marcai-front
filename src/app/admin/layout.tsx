import { Frame, Lbl } from '@/components/wf';

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return (
    <Frame largo>
      <div className="flex justify-between items-baseline">
        <h1 className="text-[17px] md:text-2xl font-normal m-0">admin</h1>
        <Lbl>plataforma</Lbl>
      </div>
      {children}
    </Frame>
  );
}
