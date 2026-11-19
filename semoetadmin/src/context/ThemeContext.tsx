"use client";

import {
  applyTheme,
  getMode,
  getPrefersDark,
  getServerMode,
  getServerPrefersDark,
  resolveTheme,
  setMode,
  subscribeMode,
  subscribePrefersDark,
  type ResolvedTheme,
  type ThemeMode,
} from "@/lib/theme";
import type React from "react";
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

type ThemeContextType = {
  /** Tema yang sedang aktif ("light" | "dark"). */
  theme: ResolvedTheme;
  /** Preferensi mode ("light" | "dark" | "auto"). */
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const themeMode = useSyncExternalStore(subscribeMode, getMode, getServerMode);
  const prefersDark = useSyncExternalStore(
    subscribePrefersDark,
    getPrefersDark,
    getServerPrefersDark,
  );
  const theme = resolveTheme(themeMode, prefersDark);

  // Sinkronkan DOM dengan state (tanpa setState).
  useEffect(() => {
    applyTheme(themeMode, prefersDark);
  }, [themeMode, prefersDark]);

  const value = useMemo<ThemeContextType>(
    () => ({
      theme,
      themeMode,
      setThemeMode: setMode,
      toggleTheme: () => setMode(theme === "light" ? "dark" : "light"),
    }),
    [theme, themeMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

export type { ResolvedTheme, ThemeMode };
