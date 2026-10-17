import type { ReactNode } from "react";

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto mt-[12vh] flex max-w-md flex-col items-center px-4 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl border bg-card text-brand [&_svg]:size-6">{icon}</div>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {children && <div className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{children}</code>
);
