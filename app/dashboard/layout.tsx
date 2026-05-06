import { redirect } from "next/navigation";

import { DashboardShell } from "../components/dashboard-shell";
import { getCommerceSessionFromCookies } from "../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getCommerceSessionFromCookies();

  if (!session) {
    redirect("/login");
  }

  return (
    <DashboardShell
      merchantName={session.merchant.name}
      userEmail={session.user.email}
    >
      {children}
    </DashboardShell>
  );
}
