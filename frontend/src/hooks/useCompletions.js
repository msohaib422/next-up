import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { useAuth } from './useAuth'

/**
 * This user's own completion ticks for one kind of item ('/tasks', '/quizzes',
 * '/assignments').
 *
 * A tick is personal. It is stored against the account that set it, so two
 * people looking at the same item each keep their own answer, and the item's own
 * status is never involved - nothing about the workspace changes when a user
 * ticks something off. That is why the ticks are their own state, read from
 * their own endpoint, rather than another field on the list the page already
 * caches: the list keeps its existing shape, cache and loading behaviour.
 *
 * WHY THE TICKS ARE ALSO KEPT IN SESSION STORAGE
 * ---------------------------------------------
 * The list of items is drawn from a cache that lives only as long as the tab
 * (see utils/listCache), so the cards themselves appear on the first paint -
 * before any request has answered. The ticks used to live there too, which meant
 * a page RELOAD started with an empty set: every tick that was set was drawn
 * unticked for the moment the request took to come back, and then snapped to its
 * real state. Reading the same record from sessionStorage instead means the very
 * first paint of a card already carries the right answer, so there is no
 * unchecked-then-checked transition at all.
 *
 * It is a display cache and never a source of truth: the read still runs on every
 * mount and replaces what is shown.
 *
 * SAFETY
 * ------
 *  - The record is keyed by ACCOUNT as well as by item type, so one user's ticks
 *    can never be drawn for another, whichever order accounts are used in the
 *    same tab.
 *  - Nothing is kept after the tab is closed, and no tick ever survives here
 *    without the server still owning it.
 *
 * A tick is applied straight away when it is clicked and put back the way it
 * was if the server refuses it, so what is drawn is always what the server was
 * last told.
 */

/** Read the ticks this tab recorded for one account and item type. */
const readStored = (key) => {
  try {
    const ids = JSON.parse(sessionStorage.getItem(key) || '[]')
    return new Set(Array.isArray(ids) ? ids : [])
  } catch {
    return new Set()
  }
}

/** Record the ticks this tab now shows. */
const writeStored = (key, ids) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(Array.from(ids)))
  } catch {
    /* storage unavailable or full - the request below still restores the state */
  }
}

export default function useCompletions(resource) {
  const { user } = useAuth()
  const path = `${resource}/completions`
  const storedKey = `nextup.completions.${user?._id || 'signed-out'}.${resource}`
  const [completions, setCompletions] = useState(() => readStored(storedKey))

  // Set the moment the user ticks or unticks anything on this page.
  //
  // The read below starts when the page opens, so a click can arrive while it is
  // still in flight. The answer to that read then describes the world before the
  // click, and letting it land would put the tick back the way it was under the
  // user's finger. So a read that has been overtaken this way is discarded, and
  // what is on screen stays what the user last did.
  const changed = useRef(false)

  useEffect(() => {
    let active = true
    api.get(path)
      .then((res) => {
        if (!active || changed.current) return
        const ids = Array.isArray(res.data) ? res.data : (res.data?.data || [])
        const next = new Set(ids)
        writeStored(storedKey, next)
        setCompletions(next)
      })
      .catch(() => {
        // A tick that cannot be read is left as it was rather than guessed at.
      })
    return () => { active = false }
  }, [path, storedKey])

  const setOne = useCallback((id, completed) => {
    changed.current = true
    const next = new Set(completions)
    if (completed) next.add(id)
    else next.delete(id)
    writeStored(storedKey, next)
    setCompletions(next)
  }, [completions, storedKey])

  const toggleCompletion = useCallback(
    async (id) => {
      const completed = !completions.has(id)
      setOne(id, completed)
      try {
        await api.put(`${resource}/${id}/completion`)
      } catch (err) {
        setOne(id, !completed)
        toast.error('Could not save your tick')
      }
    },
    [completions, resource, setOne]
  )

  return { completions, toggleCompletion }
}