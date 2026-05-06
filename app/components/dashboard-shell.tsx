"use client";

import {
  LayoutDashboard,
  Menu,
  Package,
  ReceiptText,
  Store,
  Truck,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { LogoutButton } from "./logout-button";
import { ThemeToggle } from "./theme-toggle";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Catálogo", href: "/dashboard/catalogo", icon: Package },
  { label: "Órdenes", href: "/dashboard/ordenes", icon: ReceiptText },
  { label: "Repartidores", href: "/dashboard/repartidores", icon: Truck },
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
        <p className="eyebrow">Y4Pido</p>
        <strong>Comercio</strong>
      </div>
    </div>
  );
}

function NavigationLinks({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="sidebar-nav" aria-label="Apartados principales">
      {navItems.map((item) => {
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
  merchantName,
  userEmail,
}: Readonly<{
  children: ReactNode;
  merchantName: string;
  userEmail: string;
}>) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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

  return (
    <div className="dashboard-shell">
      <aside className="sidebar" aria-label="Navegación principal">
        <BrandLockup />
        <NavigationLinks />
        <div className="sidebar-footer">
          <div className="sidebar-account">
            <strong>{merchantName}</strong>
            <span>{userEmail}</span>
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

        {children}
      </div>

      {isMenuOpen ? (
        <>
          <button
            aria-label="Cerrar menú"
            className="mobile-menu-backdrop"
            onClick={() => setIsMenuOpen(false)}
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
                onClick={() => setIsMenuOpen(false)}
                type="button"
              >
                <X size={20} />
              </button>
            </div>
            <NavigationLinks onNavigate={() => setIsMenuOpen(false)} />
            <div className="sidebar-footer">
              <div className="sidebar-account">
                <strong>{merchantName}</strong>
                <span>{userEmail}</span>
              </div>
              <ThemeToggle />
              <LogoutButton />
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
