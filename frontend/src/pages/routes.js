import { lazy } from 'react'

/**
 * Every page in the application, as one path -> loader table.
 *
 * Two things need this list and they must never disagree about a path:
 *
 *  - App.jsx turns each entry into a lazy route component.
 *  - Sidebar.jsx calls the loader for the link the pointer is heading towards,
 *    so the page's code is already downloaded by the time the click lands.
 *
 * Previously each page chunk was only requested when the route actually
 * matched, which meant every sidebar tab was a spinner followed by a download.
 * Because a chunk is fetched at most once by the module loader, calling the
 * loader ahead of time costs nothing when the navigation then happens and
 * saves the whole round trip when it does.
 *
 * The import map has to stay static for the bundler to find it: adding a path
 * with a variable specifier would produce a chunk it cannot resolve.
 */
export const PAGE_LOADERS = {
  '/': () => import('./DashboardPage'),
  '/tasks': () => import('./TasksPage'),
  '/quizzes': () => import('./QuizzesPage'),
  '/assignments': () => import('./AssignmentsPage'),
  '/essentials': () => import('./EssentialsPage'),
  '/announcements': () => import('./AnnouncementsPage'),
  '/timetable': () => import('./TimetablePage'),
  '/notifications': () => import('./NotificationsPage'),
  '/contribute': () => import('./ContributePage'),
  '/approvals': () => import('./ApprovalsPage'),
  '/users': () => import('./UsersPage'),
  '/profile': () => import('./ProfilePage'),
  '/search': () => import('./SearchPage'),
  '/login': () => import('./LoginPage'),
  '/register': () => import('./RegisterPage'),
  '/account-status': () => import('./AccountStatusPage'),
}

/** The lazy component for a path, created once so React keeps the same type. */
const cache = new Map()

export function lazyPage(path) {
  let component = cache.get(path)
  if (!component) {
    const load = PAGE_LOADERS[path]
    if (!load) return null
    component = lazy(load)
    cache.set(path, component)
  }
  return component
}

/**
 * Start downloading a page's code without rendering it.
 *
 * Safe to call for any path at any time, including repeatedly: the module
 * loader hands back the same in-flight download, so an unknown path is simply
 * ignored and a path that is already loaded costs nothing.
 */
export function prefetchPage(path) {
  try {
    PAGE_LOADERS[path]?.()
  } catch {
    /* a failed prefetch is harmless: the route will request it again */
  }
}
