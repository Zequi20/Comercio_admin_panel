"use client";

import {
  BellRing,
  LayoutDashboard,
  Menu,
  Package,
  ReceiptText,
  Store,
  Truck,
  type LucideIcon,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import {
  AdminScopeProvider,
  AdminScopeSelector,
} from "./admin-scope-context";
import { LogoutButton } from "./logout-button";
import { MerchantAvatar } from "./merchant-avatar";
import { ThemeToggle } from "./theme-toggle";
import { confirmDialogClose } from "../lib/confirm-dialog-close";
import type { MerchantDetails, PortalScope } from "../lib/auth/types";

type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

const navItems: NavigationItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Catálogo", href: "/dashboard/catalogo", icon: Package },
  { label: "Órdenes", href: "/dashboard/ordenes", icon: ReceiptText },
  { label: "Repartidores", href: "/dashboard/repartidores", icon: Truck },
  {
    label: "Notificaciones",
    href: "/dashboard/notificaciones",
    icon: BellRing,
  },
  {
    label: "Usuarios y roles",
    href: "/dashboard/usuarios",
    icon: UsersRound,
    adminOnly: true,
  },
];

function isActiveRoute(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function BrandLockup() {
  return (
    <div className="brand-lockup">
      <div className="brand-mark" aria-hidden="true">
        <Store size={26} />
      </div>
      <div>
        <p className="eyebrow">Pedidos</p>
        <strong>Comercio</strong>
      </div>
    </div>
  );
}

function NavigationLinks({
  isAdmin,
  onNavigate,
}: {
  isAdmin: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="sidebar-nav" aria-label="Apartados principales">
      {navItems.filter((item) => !item.adminOnly || isAdmin).map((item) => {
        const Icon = item.icon;
        const isActive = isActiveRoute(pathname, item.href);

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={isActive ? "nav-item active" : "nav-item"}
            href={item.href}
            key={item.label}
            onClick={onNavigate}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardShell({
  children,
  isAdmin,
  merchantMetadata,
  merchantName,
  merchants,
  scope,
  userEmail,
}: Readonly<{
  children: ReactNode;
  isAdmin: boolean;
  merchantMetadata?: Record<string, unknown> | null;
  merchantName?: string;
  merchants: MerchantDetails[];
  scope: PortalScope;
  userEmail: string;
}>) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const isGlobalAdministrationRoute = pathname === "/dashboard/usuarios";

  function closeMobileMenu() {
    if (!confirmDialogClose()) return;

    setIsMenuOpen(false);
  }

  useEffect(() => {
    document.body.classList.toggle("nav-open", isMenuOpen);

    return () => {
      document.body.classList.remove("nav-open");
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const mediaQuery = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = () => {
      if (mediaQuery.matches) {
        setIsMenuOpen(false);
      }
    };

    closeOnDesktop();
    mediaQuery.addEventListener("change", closeOnDesktop);

    return () => {
      mediaQuery.removeEventListener("change", closeOnDesktop);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    let isMounted = true;

    async function keepSessionAlive() {
      if (document.hidden) return;

      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        if (response.status === 401 && isMounted) {
          router.push("/login");
          router.refresh();
        }
      } catch {
        // Una falla temporal de red no debe expulsar al usuario.
      }
    }

    const refreshOnFocus = () => {
      void keepSessionAlive();
    };
    const refreshOnVisibility = () => {
      if (!document.hidden) {
        void keepSessionAlive();
      }
    };
    const intervalId = window.setInterval(
      () => void keepSessionAlive(),
      4 * 60 * 1000
    );

    void keepSessionAlive();
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [router]);

  const accountName =
    isAdmin && (scope.mode === "global" || isGlobalAdministrationRoute)
      ? "Administración global"
      : scope.mode === "merchant"
        ? scope.merchant.name ?? `Comercio #${scope.merchantId}`
        : merchantName ?? "Portal comercio";
  const accountMetadata =
    isGlobalAdministrationRoute
      ? null
      : scope.mode === "merchant"
        ? scope.merchant.metadata
        : isAdmin
          ? null
          : merchantMetadata;

  return (
    <AdminScopeProvider isAdmin={isAdmin} scope={scope}>
      <div className="dashboard-shell">
        <aside className="sidebar" aria-label="Navegación principal">
          <BrandLockup />
          <NavigationLinks isAdmin={isAdmin} />
          <div className="sidebar-footer">
            <div className="sidebar-account-panel">
              <MerchantAvatar
                className="sidebar-merchant-avatar"
                iconSize={18}
                metadata={accountMetadata}
                name={accountName}
              />
              <div className="sidebar-account">
                <strong>{accountName}</strong>
                <span>{userEmail}</span>
                {isAdmin ? (
                  <span className="pill assigned sidebar-role-label">ADMIN</span>
                ) : null}
              </div>
            </div>
            <ThemeToggle />
            <LogoutButton />
          </div>
        </aside>

        <div className="dashboard-content">
          <header className="mobile-app-bar">
            <button
              aria-controls="mobile-dashboard-menu"
              aria-expanded={isMenuOpen}
              aria-label="Abrir menú"
              className="icon-button menu-toggle"
              onClick={() => setIsMenuOpen(true)}
              type="button"
            >
              <Menu size={20} />
            </button>
            <BrandLockup />
            <ThemeToggle compact />
          </header>

          {isAdmin && !isGlobalAdministrationRoute ? (
            <AdminScopeSelector
              key={`${scope.mode}:${scope.merchantId ?? "all"}`}
              merchants={merchants}
              scope={scope}
            />
          ) : null}

          {children}
        </div>

        {isMenuOpen ? (
          <>
            <button
              aria-label="Cerrar menú"
              className="mobile-menu-backdrop"
              onClick={closeMobileMenu}
              type="button"
            />
            <aside
              aria-label="Menú principal"
              aria-modal="true"
              className="mobile-drawer"
              id="mobile-dashboard-menu"
              role="dialog"
            >
              <div className="mobile-drawer-header">
                <BrandLockup />
                <button
                  aria-label="Cerrar menú"
                  className="icon-button"
                  onClick={closeMobileMenu}
                  type="button"
                >
                  <X size={20} />
                </button>
              </div>
              <NavigationLinks
                isAdmin={isAdmin}
                onNavigate={() => setIsMenuOpen(false)}
              />
              <div className="sidebar-footer">
                <div className="sidebar-account-panel">
                  <MerchantAvatar
                    className="sidebar-merchant-avatar"
                    iconSize={18}
                    metadata={accountMetadata}
                    name={accountName}
                  />
                  <div className="sidebar-account">
                    <strong>{accountName}</strong>
                    <span>{userEmail}</span>
                    {isAdmin ? (
                      <span className="pill assigned sidebar-role-label">
                        ADMIN
                      </span>
                    ) : null}
                  </div>
                </div>
                <ThemeToggle />
                <LogoutButton />
              </div>
            </aside>
          </>
        ) : null}
      </div>
    </AdminScopeProvider>
  );
}
