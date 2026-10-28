"use client";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export const THEME_KEY = "hudhud.theme";
type Theme = "light" | "dark";

function storedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

function apply(theme: Theme, animate: boolean) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 350);
  }
  root.classList.toggle("dark", theme === "dark");
}

/**
 * Sun = light mode, Moon = dark mode. First visit follows the OS; once the user picks,
 * their choice is stored and always wins (no switching back on OS changes).
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = (e: MediaQueryListEvent) => {
      if (storedTheme()) return; // a manual choice is final
      const t: Theme = e.matches ? "dark" : "light";
      apply(t, true);
      setTheme(t);
    };
    mq.addEventListener("change", follow);
    return () => mq.removeEventListener("change", follow);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    apply(next, true);
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  };

  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      className="flex size-9 items-center justify-center rounded-xl text-muted hover:bg-background"
      aria-label={dark ? "الوضع الداكن مفعّل — التبديل إلى الفاتح" : "الوضع الفاتح مفعّل — التبديل إلى الداكن"}
      title={dark ? "الوضع الداكن" : "الوضع الفاتح"}
    >
      {theme === null ? <span className="size-5" /> : dark ? <Moon className="size-5" /> : <Sun className="size-5" />}
    </button>
  );
}
