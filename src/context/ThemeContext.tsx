import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import type { Theme } from "../types/domain";

const STORAGE_KEY = "armature-theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "sepia") return stored;
  } catch {
    // Storage can be unavailable in privacy-restricted browsers.
  }
  return "dark";
}

export function ThemeProvider({ children, hydrate = false }: PropsWithChildren<{ hydrate?: boolean }>) {
  const [theme, setTheme] = useState<Theme>(() => hydrate ? "dark" : resolveTheme());
  const [restored, setRestored] = useState(!hydrate);

  useEffect(() => {
    if (!hydrate) return;
    setTheme(resolveTheme());
    setRestored(true);
  }, [hydrate]);

  useEffect(() => {
    if (!restored) return;
    document.documentElement.dataset.theme = theme;
    const color = theme === "dark" ? "#111110" : theme === "sepia" ? "#F0E4C9" : "#ffffff";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Theme controls still work when the preference cannot be persisted.
    }
  }, [theme, restored]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
