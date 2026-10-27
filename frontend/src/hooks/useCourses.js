import React, { useState, useEffect } from 'react'

const STORAGE_KEY = 'nextup-courses'

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

let courses = load()
const listeners = new Set()

const persist = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(courses))
  } catch {
    // ignore storage errors
  }
}

const notify = () => {
  listeners.forEach((listener) => listener([...courses]))
}

const normalize = (name) => (typeof name === 'string' ? name.trim() : '')

const exists = (name) => {
  const lower = name.toLowerCase()
  return courses.some((c) => c.toLowerCase() === lower)
}

export function getCourses() {
  return [...courses]
}

export function registerCourses(names) {
  if (!Array.isArray(names)) return
  let changed = false
  names.forEach((name) => {
    const trimmed = normalize(name)
    if (trimmed && !exists(trimmed)) {
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
  if (exists(trimmed)) {
    return { ok: false, error: 'Course already exists.' }
  }
  courses = [...courses, trimmed]
  persist()
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
  return { courses: state, addCourse, registerCourses, getCourses }
}
