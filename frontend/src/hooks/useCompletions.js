import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { readList, rememberList } from '../utils/listCache'

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
 * The ticks are cached for display in this tab exactly like those lists are (see
 * utils/listCache), so switching tabs does not briefly draw ticks that are set as
 * empty. It is never a source of truth: the request still runs on every mount
 * and replaces what is shown, and signing out drops it.
 *
 * A tick is applied straight away when it is clicked and put back the way it
 * was if the server refuses it, so what is drawn is always what the server was
 * last told.
 */
export default function useCompletions(resource) {
  const path = `${resource}/completions`
  const [completions, setCompletions] = useState(() => new Set(readList(path) || []))

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
        rememberList(path, Array.from(next))
        setCompletions(next)
      })
      .catch(() => {
        // A tick that cannot be read is left as it was rather than guessed at.
      })
    return () => { active = false }
  }, [path])

  const setOne = useCallback((id, completed) => {
    changed.current = true
    const next = new Set(completions)
    if (completed) next.add(id)
    else next.delete(id)
    rememberList(path, Array.from(next))
    setCompletions(next)
  }, [completions, path])

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