"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout() {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  if (compact) {
    return (
      <button
        className="icon-button"
        type="button"
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
        disabled={isSubmitting}
        onClick={handleLogout}
      >
        <LogOut size={18} />
      </button>
    );
  }

  return (
    <button
      className="button-secondary"
      type="button"
      title="Cerrar sesión"
      disabled={isSubmitting}
      onClick={handleLogout}
    >
      <LogOut size={17} />
      {isSubmitting ? "Saliendo..." : "Salir"}
    </button>
  );
}
