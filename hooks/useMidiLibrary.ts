import type { MidiLibraryCategory, MidiLibraryItem } from '@/lib/library'
import type {
  getLocalizedTrackSubtitle,
  getLocalizedTrackTitle,
} from '@/lib/library-translations'
import { useEffect, useState } from 'react'

export interface MidiLibraryModule {
  categories: MidiLibraryCategory[]
  tracks: MidiLibraryItem[]
  categoryIndex: Map<string, MidiLibraryCategory>
  trackIndex: Map<string, MidiLibraryItem>
  getLocalizedTrackTitle: typeof getLocalizedTrackTitle
  getLocalizedTrackSubtitle: typeof getLocalizedTrackSubtitle
}

// The library catalog (~46 KB gz of track metadata + JA translations) is only
// needed once the UI wants a track list, so it stays out of the first-paint
// bundle and loads as its own chunk right after mount.
export function useMidiLibrary() {
  const [library, setLibrary] = useState<MidiLibraryModule | null>(null)

  useEffect(() => {
    let cancelled = false
    let idleHandle: number | null = null

    const load = () => {
      void Promise.all([
        import('@/lib/library'),
        import('@/lib/library-translations'),
      ]).then(([data, translations]) => {
        if (cancelled) {
          return
        }

        setLibrary({
          categories: data.MIDI_LIBRARY_CATEGORIES,
          tracks: data.MIDI_LIBRARY,
          categoryIndex: new Map(
            data.MIDI_LIBRARY_CATEGORIES.map(category => [category.id, category]),
          ),
          trackIndex: new Map(
            data.MIDI_LIBRARY_CATEGORIES.flatMap(category =>
              category.items.map(item => [item.id, item] as const),
            ),
          ),
          getLocalizedTrackTitle: translations.getLocalizedTrackTitle,
          getLocalizedTrackSubtitle: translations.getLocalizedTrackSubtitle,
        })
      })
    }

    const supportsIdleCallback
      = typeof window.requestIdleCallback === 'function'

    idleHandle = supportsIdleCallback
      ? window.requestIdleCallback(load, { timeout: 1500 })
      : window.setTimeout(load, 250)

    return () => {
      cancelled = true
      if (idleHandle !== null) {
        if (supportsIdleCallback) {
          window.cancelIdleCallback(idleHandle)
        }
        else {
          window.clearTimeout(idleHandle)
        }
      }
    }
  }, [])

  return library
}
