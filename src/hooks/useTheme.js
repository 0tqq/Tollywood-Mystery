import { useState, useEffect, useCallback } from "react";
import { readStorage, writeStorage } from "../lib/storage.js";

export const THEME_KEY = "tm-theme";

function initialTheme() {
  const saved = readStorage(THEME_KEY);
  return saved === "light" || saved === "dark" ? saved : "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeStorage(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, toggleTheme };
}
