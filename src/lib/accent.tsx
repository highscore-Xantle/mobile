// App accent theme, driven by the focused game on the home carousel. Scrolling
// to a game re-themes the right-side band, the active category chip, and the
// bottom-nav pill. Mounted at the (tabs) layout so both the screens and the
// custom tab bar share it.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type Accent = {
  theme: [string, string];   // right-band gradient
  accent: string;            // pill / active-icon solid colour
};

const DEFAULT_ACCENT: Accent = { theme: ['#489AE7', '#3B6DCF'], accent: '#3B9DE7' };

const AccentContext = createContext<{ accent: Accent; setAccent: (a: Accent) => void }>({
  accent: DEFAULT_ACCENT,
  setAccent: () => {},
});

export function AccentProvider({ children }: { children: ReactNode }) {
  const [accent, setAccent] = useState<Accent>(DEFAULT_ACCENT);
  const value = useMemo(() => ({ accent, setAccent }), [accent]);
  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>;
}

export function useAccent() {
  return useContext(AccentContext);
}
