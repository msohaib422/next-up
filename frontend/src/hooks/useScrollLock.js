import { useEffect } from 'react'

/**
 * Freezes page scrolling for as long as a full-screen overlay (the mobile
 * sidebar) is open, and puts the page back exactly where it was afterwards.
 *
 * The page is pinned with position: fixed at the offset it was scrolled to,
 * rather than only having overflow hidden on the body, because overflow alone
 * does not reliably stop a page from scrolling on touch devices, and because
 * pinning is what keeps the content behind the overlay from moving at all.
 *
 * The styles it sets are saved and restored on cleanup, so nothing is left
 * behind once the overlay closes. While the lock is on, scrolling belongs to
 * the overlay itself, which stops it with overscroll-contain.
 */
export default function useScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined

    const { body } = document
    const scrollY = window.scrollY
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflowY: body.style.overflowY,
    }

    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    body.style.overflowY = 'hidden'

    return () => {
      body.style.position = previous.position
      body.style.top = previous.top
      body.style.left = previous.left
      body.style.right = previous.right
      body.style.width = previous.width
      body.style.overflowY = previous.overflowY
      // Unpinning jumps the page back to the top, so the offset the user was at
      // is restored here.
      window.scrollTo(0, scrollY)
    }
  }, [locked])
}
