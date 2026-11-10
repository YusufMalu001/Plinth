import type { ReactNode } from 'react';

export default function ProductionLayout({ children }: { children: ReactNode }) {
  return <div className="production-flat-ui">{children}</div>;
}
