/**
 * The planner's looks. A theme is a set of design tokens and a few reshaped
 * components, switched by `data-theme` on the root element (see the SCSS
 * partials). Light and dark are separate from this: every theme has both,
 * and follows the device.
 *
 * To add a theme: give it an entry here and in `User::THEMES` on the server,
 * and a `_theme-<id>.scss` partial.
 */
export const THEMES = [
    {
        id: 'fun',
        name: 'Fun Theme',
        description:
            'A hand-kept bullet journal: dotted paper, inked boxes, handwriting and highlighter.',
        // The browser and status bar color, light and dark.
        chrome: { light: '#fbf8f1', dark: '#1b1a21' },
    },
    {
        id: 'clean',
        name: 'Clean Theme',
        description:
            'Calm and precise, in the style of a system app: the system typeface, white cards and one blue tint.',
        chrome: { light: '#f2f2f7', dark: '#000000' },
    },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const STORAGE_KEY = 'planner.theme';

export const isTheme = (value: unknown): value is ThemeId =>
    THEMES.some((theme) => theme.id === value);

/**
 * Switch the page to a theme, and remember it on this device so the next
 * visit can be drawn in it straight away, before the session has loaded.
 */
export function applyTheme(id: string): void {
    const theme = THEMES.find((candidate) => candidate.id === id) ?? THEMES[0];

    document.documentElement.dataset.theme = theme.id;

    for (const mode of ['light', 'dark'] as const) {
        document
            .querySelector(`meta[name="theme-color"][media*="${mode}"]`)
            ?.setAttribute('content', theme.chrome[mode]);
    }

    try {
        window.localStorage.setItem(STORAGE_KEY, theme.id);
    } catch {
        // Private browsing: the theme still applies for this visit.
    }
}
