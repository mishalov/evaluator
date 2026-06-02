/**
 * state/persistence.ts
 *
 * localStorage persistence for AppState.
 *
 * Key: 'evaluator:state'
 * Debounce: 300ms to avoid thrashing on rapid input changes.
 *
 * NEVER persists simulation results — only inputs.
 */
import type { AppState } from '../engine/types'
import { validateAndMigrate } from './schema'

const STORAGE_KEY = 'evaluator:state'

let debounceTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Save AppState to localStorage (debounced 300ms).
 */
export function saveToLocalStorage(state: AppState): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Storage full — silently ignore
    }
  }, 300)
}

/**
 * Load AppState from localStorage.
 * Runs migrations + zod validation.
 * Returns null if not found or invalid.
 */
export function loadFromLocalStorage(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return validateAndMigrate(parsed)
  } catch {
    return null
  }
}

/**
 * Clear persisted state (used for reset).
 */
export function clearLocalStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore
  }
}
