import React, { useState, useEffect } from 'react'

const STORAGE_KEY = 'nextup-courses'
const DELETED_KEY = 'nextup-deleted-courses'

const load = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === 'string' && c.trim()) : []
  } catch {
    return []
  }
}

const loadDeleted = () => {
  try {
    const raw = localStorage.getItem(DELETED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === 'string' && c.trim()) : []
  } catch {
    return []
  }
}

let courses = load()
let deleted = loadDeleted()
const listeners = new Set()

const persist = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(courses))
  } catch {
    // ignore storage errors
  }
}

const persistDeleted = () => {
  try {
    localStorage.setItem(DELETED_KEY, JSON.stringify(deleted))
  } catch {
    // ignore storage errors
  }
}

const notify = () => {
  listeners.forEach((listener) => listener([...courses]))
}

const normalize = (name) => (typeof name === 'string' ? name.trim() : '')

const isDeleted = (name) => {
  const lower = normalize(name).toLowerCase()
  if (!lower) return false
  return deleted.some((c) => normalize(c).toLowerCase() === lower)
}

const exists = (name) => {
  const lower = name.toLowerCase()
  return courses.some((c) => c.toLowerCase() === lower)
}

export function getCourses() {
  return [...courses]
}

export function getDeletedCourses() {
  return [...deleted]
}

export function isCourseDeleted(name) {
  return isDeleted(name)
}

export function registerCourses(names) {
  if (!Array.isArray(names)) return
  let changed = false
  names.forEach((name) => {
    const trimmed = normalize(name)
    if (!trimmed) return
    if (isDeleted(trimmed)) return
    if (!exists(trimmed)) {
      courses = [...courses, trimmed]
      changed = true
    }
  })
  if (changed) {
    persist()
    notify()
  }
}

export function addCourse(name) {
  const trimmed = normalize(name)
  if (!trimmed) {
    return { ok: false, error: 'Course name is required.' }
  }
  if (isDeleted(trimmed)) {
    // Re-allow a previously deleted course if explicitly created again.
    deleted = deleted.filter((c) => normalize(c).toLowerCase() !== trimmed.toLowerCase())
    persistDeleted()
  }
  if (exists(trimmed)) {
    return { ok: false, error: 'Course already exists.' }
  }
  courses = [...courses, trimmed]
  persist()
  notify()
  return { ok: true, value: trimmed }
}

export function deleteCourse(name) {
  const trimmed = normalize(name)
  if (!trimmed) {
    return { ok: false, error: 'Course name is required.' }
  }
  courses = courses.filter((c) => c.toLowerCase() !== trimmed.toLowerCase())
  if (!deleted.some((c) => normalize(c).toLowerCase() === trimmed.toLowerCase())) {
    deleted = [...deleted, trimmed]
  }
  persist()
  persistDeleted()
  notify()
  return { ok: true, value: trimmed }
}

export function subscribeCourses(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCourses() {
  const [state, setState] = useState(() => getCourses())
  useEffect(() => {
    setState(getCourses())
    const unsub = subscribeCourses(setState)
    return unsub
  }, [])
  return {
    courses: state,
    addCourse,
    registerCourses,
    deleteCourse,
    isCourseDeleted,
    getCourses,
    getDeletedCourses,
  }
}
