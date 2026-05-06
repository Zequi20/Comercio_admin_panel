"use client";

import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

const storageKey = "y4pido-theme";

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

function preferredTheme(): Theme {
  if (typeof window === "undefined") return "light";

  const storedTheme = window.localStorage.getItem(storageKey);

  if (isTheme(storedTheme)) {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  function handleToggle() {
    const currentTheme = preferredTheme();
    const nextTheme = currentTheme === "dark" ? "light" : "dark";

    window.localStorage.setItem(storageKey, nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <button
      aria-label="Cambiar tema"
      className={compact ? "icon-button theme-toggle" : "button-secondary theme-toggle"}
      onClick={handleToggle}
      title="Cambiar tema"
      type="button"
    >
      <span className="theme-toggle-option theme-when-light">
        <Moon size={compact ? 18 : 17} />
        {compact ? null : "Modo oscuro"}
      </span>
      <span className="theme-toggle-option theme-when-dark">
        <Sun size={compact ? 18 : 17} />
        {compact ? null : "Modo normal"}
      </span>
    </button>
  );
}
