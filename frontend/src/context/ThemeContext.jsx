import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    // React state changes are applied after the current event has finished, so
    // a change made only in the state updater was not on screen until after
    // React had re-rendered and committed everything that reads it. `dark` was
    // applied by an effect after that commit, so for one commit the controls
    // that carry both a light and a dark background (the search box, the date
    // control, the course/status/priority dropdowns, the circular tiles) were
    // still painted in the theme that had just been switched away from. That is
    // the flash of the opposite colour.
    //
    // The class is therefore written straight to the root element here, in the
    // same event that changes the state, and the effect below agrees with it.
    // Both write the same value, so this is idempotent: whichever React ends up
    // using, the document already carries the right theme and the effect only
    // has to agree with it.
    const next = (document.documentElement.classList.contains('dark')) ? 'light' : 'dark'
    document.documentElement.classList.toggle('dark', next === 'dark')
    setTheme(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
