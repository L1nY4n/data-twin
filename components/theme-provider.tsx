'use client'

import * as React from 'react'

type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

export type ThemeProviderProps = {
  attribute?: 'class'
  children: React.ReactNode
  defaultTheme?: Theme
  disableTransitionOnChange?: boolean
  enableSystem?: boolean
  storageKey?: string
}

type ThemeContextValue = {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const DEFAULT_STORAGE_KEY = 'theme'

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveTheme(theme: Theme, enableSystem: boolean): ResolvedTheme {
  if (theme === 'system' && enableSystem) {
    return getSystemTheme()
  }
  return theme === 'dark' ? 'dark' : 'light'
}

function temporarilyDisableTransitions() {
  const style = document.createElement('style')
  style.appendChild(
    document.createTextNode(
      `*{transition:none!important;-webkit-transition:none!important;animation:none!important}`
    )
  )
  document.head.appendChild(style)

  return () => {
    window.getComputedStyle(document.body)
    document.head.removeChild(style)
  }
}

export function ThemeProvider({
  children,
  attribute = 'class',
  defaultTheme = 'light',
  disableTransitionOnChange = false,
  enableSystem = true,
  storageKey = DEFAULT_STORAGE_KEY,
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme)
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>(
    resolveTheme(defaultTheme, enableSystem)
  )

  React.useEffect(() => {
    const stored =
      typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null
    const nextTheme =
      stored === 'light' || stored === 'dark' || stored === 'system' ? stored : defaultTheme

    setThemeState(nextTheme)
    setResolvedTheme(resolveTheme(nextTheme, enableSystem))
  }, [defaultTheme, enableSystem, storageKey])

  React.useEffect(() => {
    if (typeof window === 'undefined') return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      setResolvedTheme(resolveTheme(theme, enableSystem))
    }

    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [enableSystem, theme])

  React.useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const cleanupTransitions = disableTransitionOnChange
      ? temporarilyDisableTransitions()
      : null

    if (attribute === 'class') {
      root.classList.remove('light', 'dark')
      root.classList.add(resolvedTheme)
    }

    cleanupTransitions?.()
  }, [attribute, disableTransitionOnChange, resolvedTheme])

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      setThemeState(nextTheme)
      setResolvedTheme(resolveTheme(nextTheme, enableSystem))
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, nextTheme)
      }
    },
    [enableSystem, storageKey]
  )

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
    }),
    [resolvedTheme, setTheme, theme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = React.useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
