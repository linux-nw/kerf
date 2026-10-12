export type ThemeChoice = 'dark' | 'light' | 'system'

const KEY = 'kerf.theme'

export function loadTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored
  } catch {
    return 'dark'
  }
  return 'dark'
}

export function saveTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(KEY, choice)
  } catch {
    return
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const resolved = choice === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : choice
  document.documentElement.dataset['theme'] = resolved
}
