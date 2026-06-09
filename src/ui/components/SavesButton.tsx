/**
 * ui/components/SavesButton.tsx
 *
 * Header dropdown for managing named saves.
 *
 * Saves list is view-state held in local useState — it is NOT in the Zustand
 * store. The list is refreshed via listSaves() on menu open and after every
 * mutation, so it always reflects what is in localStorage.
 *
 * Outside-click-to-close is handled by a mousedown listener on document
 * that is registered when the menu opens and cleaned up on close/unmount.
 *
 * Load guard: always confirm before replacing current inputs.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useEvaluatorStore } from '../../state/store'
import { listSaves } from '../../state/saves'
import type { NamedSave } from '../../state/saves'

// ---------------------------------------------------------------------------
// Relative-time helper — no external deps, uses Intl.RelativeTimeFormat
// ---------------------------------------------------------------------------

function relativeTime(ts: number): string {
  const diffMs = ts - Date.now()
  const diffSec = Math.round(diffMs / 1000)
  const diffMin = Math.round(diffSec / 60)
  const diffHr = Math.round(diffMin / 60)
  const diffDay = Math.round(diffHr / 24)
  const diffWeek = Math.round(diffDay / 7)
  const diffMonth = Math.round(diffDay / 30)
  const diffYear = Math.round(diffDay / 365)

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, 'second')
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute')
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, 'hour')
  if (Math.abs(diffDay) < 7) return rtf.format(diffDay, 'day')
  if (Math.abs(diffDay) < 30) return rtf.format(diffWeek, 'week')
  if (Math.abs(diffDay) < 365) return rtf.format(diffMonth, 'month')
  return rtf.format(diffYear, 'year')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SavesButton() {
  const [open, setOpen] = useState(false)
  const [savesList, setSavesList] = useState<NamedSave[]>([])
  // Inline status message shown inside the menu (e.g. cap-reached error)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Store actions — one selector per action to avoid re-renders on unrelated changes
  const saveCurrentAs = useEvaluatorStore((s) => s.saveCurrentAs)
  const overwriteSave = useEvaluatorStore((s) => s.overwriteSave)
  const loadSave = useEvaluatorStore((s) => s.loadSave)
  const renameSave = useEvaluatorStore((s) => s.renameSave)
  const deleteSave = useEvaluatorStore((s) => s.deleteSave)

  // Refresh the local saves list from localStorage
  const refresh = useCallback(() => {
    setSavesList(listSaves())
    setStatusMsg(null)
  }, [])

  // Open menu: load saves and attach outside-click listener
  const openMenu = useCallback(() => {
    refresh()
    setOpen(true)
  }, [refresh])

  const closeMenu = useCallback(() => {
    setOpen(false)
  }, [])

  // Outside-click handler registered on the document while menu is open
  useEffect(() => {
    if (!open) return

    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [open, closeMenu])

  // ---- Action handlers ----

  function handleSaveCurrent() {
    const raw = window.prompt('Name this save:')
    if (!raw) return // cancelled or empty
    const result = saveCurrentAs(raw)
    if (result.ok) {
      refresh()
      return
    }
    if (result.error === 'cap-reached') {
      setStatusMsg('Save limit reached (50). Delete an old save first.')
    } else if (result.error === 'quota') {
      setStatusMsg("Couldn't save — storage full.")
    }
    // 'invalid-name': do nothing — the prompt already shows the user their input
  }

  function handleLoad(save: NamedSave) {
    if (!window.confirm('Load this save? Your current unsaved inputs will be replaced.')) return
    const result = loadSave(save.id)
    if (!result.ok) {
      if (result.error === 'corrupt') {
        const shouldDelete = window.confirm(
          'This save couldn’t be read. Delete it?',
        )
        if (shouldDelete) {
          deleteSave(save.id)
          refresh()
        }
      }
      return
    }
    closeMenu()
  }

  function handleOverwrite(e: React.MouseEvent, save: NamedSave) {
    e.stopPropagation()
    if (!window.confirm('Overwrite this save with current inputs?')) return
    const result = overwriteSave(save.id)
    if (!result.ok) {
      if (result.error === 'quota') {
        setStatusMsg("Couldn't save — storage full.")
      } else if (result.error === 'not-found') {
        // Save was deleted externally (another tab or cleared storage); surface
        // feedback and refresh so the stale row disappears.
        setStatusMsg('That save no longer exists.')
        refresh()
      }
    } else {
      refresh()
    }
  }

  function handleRename(e: React.MouseEvent, save: NamedSave) {
    e.stopPropagation()
    const raw = window.prompt('Rename save:', save.name)
    if (!raw) return
    const result = renameSave(save.id, raw)
    if (!result.ok && result.error === 'invalid-name') {
      // Silent — the entered name was empty or too long; no further action needed
      return
    }
    refresh()
  }

  function handleDelete(e: React.MouseEvent, save: NamedSave) {
    e.stopPropagation()
    if (!window.confirm('Delete this save?')) return
    deleteSave(save.id)
    refresh()
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={open ? closeMenu : openMenu}
        className="text-sm border border-gray-300 rounded px-3 py-1 hover:bg-gray-50 transition-colors flex items-center gap-1"
        aria-expanded={open}
        aria-haspopup="true"
      >
        Saves
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-30"
          role="menu"
        >
          {/* Save current button */}
          <div className="p-2 border-b border-gray-100">
            <button
              onClick={handleSaveCurrent}
              className="w-full text-left text-sm px-3 py-2 rounded hover:bg-gray-50 transition-colors text-gray-700"
            >
              + Save current...
            </button>
            {statusMsg && (
              <p className="text-xs text-red-600 px-3 pt-1">{statusMsg}</p>
            )}
          </div>

          {/* Saves list */}
          <ul className="max-h-72 overflow-y-auto" role="list">
            {savesList.length === 0 ? (
              <li className="text-sm text-gray-400 text-center py-6 px-3">
                No saved scenarios yet.
              </li>
            ) : (
              savesList.map((save) => (
                <li
                  key={save.id}
                  role="menuitem"
                  onClick={() => handleLoad(save)}
                  className="flex items-center gap-1 px-3 py-2 hover:bg-gray-50 cursor-pointer group"
                >
                  {/* Name + timestamp */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800 truncate font-medium">
                      {save.name}
                    </div>
                    <div className="text-xs text-gray-400">
                      {relativeTime(save.updatedAt)}
                    </div>
                  </div>

                  {/* Per-row affordances */}
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleOverwrite(e, save)}
                      title="Overwrite with current"
                      className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100"
                      aria-label={`Overwrite save "${save.name}" with current inputs`}
                    >
                      &#x21BB;
                    </button>
                    <button
                      onClick={(e) => handleRename(e, save)}
                      title="Rename"
                      className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100"
                      aria-label={`Rename save "${save.name}"`}
                    >
                      &#x270E;
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, save)}
                      title="Delete"
                      className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-gray-100"
                      aria-label={`Delete save "${save.name}"`}
                    >
                      &#x1F5D1;
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
