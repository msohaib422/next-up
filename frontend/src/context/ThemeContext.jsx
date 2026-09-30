import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

/**
 * Marks the one paint in which the theme changes hands.
 *
 * The controls animate their own colour changes (`transition-colors` on the
 * search box, the date control, the dropdowns, the filter buttons, the sidebar
 * links), while the page background, the sidebar, the header and the cards do
 * not animate at all. Adding or removing `dark` therefore repainted the large
 * surfaces instantly and animated the controls over the next 150ms, so for that
 * moment the page was a mix of the two themes: a white search box and white
 * dropdowns on a dark background, the active tab still tinted with the old one.
 * That mix is the flash that was reported on every switch, in both directions.
 *
 * The attribute switches the transitions off for exactly the paint that carries
 * the new theme, so every part of the page changes colour in the same step. It
 * is set in the same event as the swap, so nothing is deferred and nothing waits
 * on a second render, and it is removed as soon as the browser has painted.
 */
const SWITCH_ATTRIBUTE = 'data-theme-switch'

/**
 * Write the theme class onto the document, with the transitions held off for the
 * one paint that shows the change.
 *
 * Writing the class is what the whole app's appearance hangs off - every
 * `dark:` utility is keyed to it - so it is written straight to the root element
 * rather than being left to a render. The class only changes when the theme
 * actually changes, and only then is the attribute needed: a page load finds
 * `dark` already on the document (the inline script in index.html put it there
 * before the first paint) and returns without touching anything.
 */
function applyThemeClass(isDark) {
  const root = document.documentElement
  if (root.classList.contains('dark') === isDark) return

  root.setAttribute(SWITCH_ATTRIBUTE, '')
  root.classList.toggle('dark', isDark)

  // Two frames, deliberately. The first is the frame the browser paints the new
  // theme in, and the guard has to still be on while that style is calculated or
  // the transitions would start and the controls would fade again. The second is
  // the frame after it, where the guard comes off. Lifting it in the first frame
  // would take it off before the browser had recalculated anything, and the
  // fade would be back.
  //
  // Removing the attribute is not itself a style change, so nothing is left
  // half-finished and nothing animates on the way back: hover and focus simply
  // start animating again from the next interaction.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.removeAttribute(SWITCH_ATTRIBUTE))
  })
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    // Agrees with the class the toggle already wrote, and repairs the document on
    // a page load where the stored theme and the class disagree. Both writes are
    // the same value, so whichever React ends up using, the document already
    // carries the right theme and this only has to keep it in step.
    applyThemeClass(theme === 'dark')
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
    // same event that changes the state, with the transitions held off for that
    // one paint, and the effect above agrees with it. Both write the same value,
    // so this is idempotent: whichever React ends up using, the document already
    // carries the right theme and the effect only has to agree with it.
    const next = (document.documentElement.classList.contains('dark')) ? 'light' : 'dark'
    applyThemeClass(next === 'dark')
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
