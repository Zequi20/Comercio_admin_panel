import type { ReactNode } from "react";

export function PageHeader({
  actions,
  description,
  title,
}: Readonly<{
  actions?: ReactNode;
  description: ReactNode;
  title: string;
}>) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <h1 className="dashboard-title">{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {actions ? <div className="dashboard-actions">{actions}</div> : null}
    </header>
  );
}
