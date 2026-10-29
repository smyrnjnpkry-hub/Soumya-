import type { ColorKey } from './types';

export const cn = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

/** Palette order matters: it is the validated colour-blind-safe sequence. */
export const COLOR_KEYS: ColorKey[] = ['blue', 'orange', 'aqua', 'yellow', 'magenta', 'green', 'violet', 'red', 'slate'];

/** CSS colour for a category colour key; switches automatically with the theme. */
export const colorVar = (key: string) => `var(--cat-${key})`;

/** A translucent tint of a colour, e.g. for icon badges and meter tracks. */
export const tint = (color: string, percent = 15) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
