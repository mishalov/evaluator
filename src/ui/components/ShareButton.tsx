/**
 * ui/components/ShareButton.tsx
 *
 * Copy the current URL (with state encoded in hash) to clipboard.
 */
import { useState } from 'react'

export function ShareButton() {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select the URL
      window.prompt('Copy this URL to share:', window.location.href)
    }
  }

  return (
    <button
      onClick={handleShare}
      className="text-sm border border-gray-300 rounded px-3 py-1 hover:bg-gray-50 transition-colors flex items-center gap-1"
    >
      {copied ? (
        <>
          <span className="text-green-600">Copied!</span>
        </>
      ) : (
        <>Share</>
      )}
    </button>
  )
}
