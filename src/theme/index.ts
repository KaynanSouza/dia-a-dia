import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

export type Theme = {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  faint: string;
  border: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  /** gradiente do cartão de destaque */
  hero: readonly [string, string, ...string[]];
  shadow: string;
};

const light: Theme = {
  dark: false,
  bg: '#F4F5FA',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF0F6',
  text: '#0F1222',
  muted: '#646B80',
  faint: '#A2A8B8',
  border: '#E4E6EE',
  primary: '#5B4CF0',
  primarySoft: 'rgba(91,76,240,0.10)',
  onPrimary: '#FFFFFF',
  success: '#12A150',
  successSoft: 'rgba(18,161,80,0.12)',
  danger: '#E5354F',
  dangerSoft: 'rgba(229,53,79,0.10)',
  warning: '#D97706',
  warningSoft: 'rgba(217,119,6,0.12)',
  hero: ['#4F3EE6', '#7B4DF2', '#A855F7'],
  shadow: '#1B1F3B',
};

const dark: Theme = {
  dark: true,
  bg: '#0A0B12',
  surface: '#14161F',
  surfaceAlt: '#1D202C',
  text: '#F2F3F8',
  muted: '#9AA0B4',
  faint: '#5E6478',
  border: '#232634',
  primary: '#8C7DFF',
  primarySoft: 'rgba(140,125,255,0.16)',
  onPrimary: '#FFFFFF',
  success: '#34D07A',
  successSoft: 'rgba(52,208,122,0.14)',
  danger: '#FF5C72',
  dangerSoft: 'rgba(255,92,114,0.14)',
  warning: '#FBBF24',
  warningSoft: 'rgba(251,191,36,0.14)',
  hero: ['#3B2BC4', '#6236D9', '#8B3FE0'],
  shadow: '#000000',
};

export const themes = { light, dark };

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Estilos dependentes do tema, recriados só quando o tema muda. */
export function makeStyles<T>(factory: (t: Theme) => T) {
  const cache = new Map<Theme, T>();
  return function useStyles(): T {
    const t = useTheme();
    return useMemo(() => {
      let s = cache.get(t);
      if (!s) {
        s = factory(t);
        cache.set(t, s);
      }
      return s;
    }, [t]);
  };
}

/** Cor com alfa a partir de #RRGGBB. */
export function alpha(hex: string, a: number) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
