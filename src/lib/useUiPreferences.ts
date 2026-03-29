import { useEffect, useMemo, useState } from "react";

export type AccentTheme = "orange" | "cyan" | "rose" | "lime";
export type InterfaceDensity = "comfortable" | "compact";
export type SurfaceStyle = "solid" | "glass";

export interface UiPreferences {
  accent: AccentTheme;
  density: InterfaceDensity;
  surface: SurfaceStyle;
  sidebarDefaultOpen: boolean;
}

const STORAGE_KEY = "tester-pro-ui-preferences";

const defaultPreferences: UiPreferences = {
  accent: "orange",
  density: "comfortable",
  surface: "solid",
  sidebarDefaultOpen: true,
};

const accentThemes: Record<AccentTheme, { accent: string; accentStrong: string; accentSoft: string; accentShadow: string }> = {
  orange: {
    accent: "#f97316",
    accentStrong: "#ea580c",
    accentSoft: "rgba(249,115,22,0.16)",
    accentShadow: "rgba(249,115,22,0.28)",
  },
  cyan: {
    accent: "#06b6d4",
    accentStrong: "#0891b2",
    accentSoft: "rgba(6,182,212,0.16)",
    accentShadow: "rgba(6,182,212,0.28)",
  },
  rose: {
    accent: "#f43f5e",
    accentStrong: "#e11d48",
    accentSoft: "rgba(244,63,94,0.16)",
    accentShadow: "rgba(244,63,94,0.28)",
  },
  lime: {
    accent: "#84cc16",
    accentStrong: "#65a30d",
    accentSoft: "rgba(132,204,22,0.16)",
    accentShadow: "rgba(132,204,22,0.28)",
  },
};

export function useUiPreferences() {
  const [preferences, setPreferences] = useState<UiPreferences>(() => {
    if (typeof window === "undefined") {
      return defaultPreferences;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return defaultPreferences;
    }

    try {
      return { ...defaultPreferences, ...JSON.parse(stored) } as UiPreferences;
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      return defaultPreferences;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));

    const root = document.documentElement;
    const theme = accentThemes[preferences.accent];
    root.dataset.uiDensity = preferences.density;
    root.dataset.uiSurface = preferences.surface;
    root.style.setProperty("--tp-accent", theme.accent);
    root.style.setProperty("--tp-accent-strong", theme.accentStrong);
    root.style.setProperty("--tp-accent-soft", theme.accentSoft);
    root.style.setProperty("--tp-accent-shadow", theme.accentShadow);
  }, [preferences]);

  const accentStyle = useMemo(() => ({
    backgroundColor: "var(--tp-accent-strong)",
    boxShadow: "0 20px 45px var(--tp-accent-shadow)",
  }), []);

  const accentSoftStyle = useMemo(() => ({
    backgroundColor: "var(--tp-accent-soft)",
    color: "var(--tp-accent)",
  }), []);

  return {
    preferences,
    setPreferences,
    accentStyle,
    accentSoftStyle,
  };
}
