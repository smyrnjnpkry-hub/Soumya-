import { create } from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'system';
type Theme = 'light' | 'dark';

/** Same key the pre-paint script in index.html reads. */
const STORAGE_KEY = 'fintrack-theme';
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // ignore
  }
  return 'light';
}

const resolve = (pref: ThemePreference): Theme => (pref === 'system' ? (systemDark.matches ? 'dark' : 'light') : pref);

function apply(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1020' : '#f5f7fb');
}

interface ThemeState {
  preference: ThemePreference;
  theme: Theme;
  setPreference: (pref: ThemePreference) => void;
  toggle: () => void;
}

const initial = readPreference();

export const useTheme = create<ThemeState>()((set, get) => ({
  preference: initial,
  theme: resolve(initial),
  setPreference: (preference) => {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // ignore
    }
    const theme = resolve(preference);
    apply(theme);
    set({ preference, theme });
  },
  toggle: () => get().setPreference(get().theme === 'dark' ? 'light' : 'dark'),
}));

systemDark.addEventListener('change', () => {
  const { preference, setPreference } = useTheme.getState();
  if (preference === 'system') setPreference('system');
});
