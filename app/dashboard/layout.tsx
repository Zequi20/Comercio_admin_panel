import { redirect } from "next/navigation";

import { DashboardShell } from "../components/dashboard-shell";
import {
  isAdminSession,
  resolvePortalScope,
} from "../lib/auth/portal-scope";
import { getCommerceRequestContextFromCookies } from "../lib/auth/session";
import { listMerchantDirectory } from "../lib/services/auth-service";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const context = await getCommerceRequestContextFromCookies({
    includeMerchantDetails: true,
  });

  if (!context) {
    redirect("/login");
  }

  const { accessToken, session } = context;
  const isAdmin = isAdminSession(session);
  const [scope, merchants] = await Promise.all([
    resolvePortalScope(context),
    isAdmin
      ? listMerchantDirectory(accessToken).catch(() => [])
      : Promise.resolve([]),
  ]);

  return (
    <DashboardShell
      isAdmin={isAdmin}
      merchantMetadata={session.merchant?.metadata}
      merchantName={session.merchant?.name}
      merchants={merchants}
      scope={scope}
      userEmail={session.user.email}
    >
      {children}
    </DashboardShell>
  );
}
