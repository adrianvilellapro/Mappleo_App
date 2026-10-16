"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";
const storageKey = "mappleo-theme";
const changeEvent = "mappleo-theme-change";

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey && event.key !== null) return;
    document.documentElement.dataset.theme =
      event.newValue === "dark" ? "dark" : "light";
    listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(changeEvent, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(changeEvent, listener);
  };
}

function getTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    // El cambio sigue funcionando aunque el navegador bloquee el almacenamiento.
  }
  window.dispatchEvent(new Event(changeEvent));
}

function useTheme() {
  return useSyncExternalStore(subscribe, getTheme, () => "light");
}

export function ThemeToggle() {
  const theme = useTheme();
  const dark = theme === "dark";
  return (
    <button
      className="icon-button theme-toggle"
      type="button"
      aria-pressed={dark}
      aria-label={dark ? "Activar modo claro" : "Activar modo oscuro"}
      title={dark ? "Activar modo claro" : "Activar modo oscuro"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export function ThemeSettings() {
  const theme = useTheme();
  return (
    <div
      className="theme-options"
      role="group"
      aria-label="Tema de la aplicación"
    >
      <button
        className="button button-outline"
        type="button"
        aria-pressed={theme === "light"}
        onClick={() => setTheme("light")}
      >
        <Sun size={16} /> Claro
      </button>
      <button
        className="button button-outline"
        type="button"
        aria-pressed={theme === "dark"}
        onClick={() => setTheme("dark")}
      >
        <Moon size={16} /> Oscuro
      </button>
    </div>
  );
}
