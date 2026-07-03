'use client'

import type { LucideIcon } from 'lucide-react'
import type { Ref } from 'react'
import type { MidiLibraryModule } from '@/hooks/useMidiLibrary'
import type { AppLanguage } from '@/lib/camera-presets'
import type { UiCopy } from '@/lib/i18n'
import type { MidiLibraryCategory, MidiLibraryItem } from '@/lib/library'
import type { LibraryPrimaryGroup } from '@/lib/library-meta'
import { ExternalLink, X } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { cn } from '@/lib/utils'

export function LibraryPanel({
  show,
  isMobile,
  reduceMotion,
  language,
  copy,
  library,
  libraryPrimaryGroups,
  activeLibraryGroup,
  activeLibraryCategory,
  activeLibraryCategoryId,
  activeLibraryCategoryShortLabel,
  activeLibraryHeading,
  activeLibraryDescription,
  ActiveLibraryGroupIcon,
  ActiveLibraryCategoryIcon,
  activeTrainSubcategories,
  getSubcategoryMeta,
  visibleLibraryItems,
  currentLibraryTrackId,
  isLoadingLibrary,
  listRef,
  onSelectCategory,
  onSelectTrack,
  onClose,
}: {
  show: boolean
  isMobile: boolean
  reduceMotion: boolean
  language: AppLanguage
  copy: UiCopy
  library: MidiLibraryModule | null
  libraryPrimaryGroups: LibraryPrimaryGroup[]
  activeLibraryGroup: LibraryPrimaryGroup | null
  activeLibraryCategory: MidiLibraryCategory | null
  activeLibraryCategoryId: string
  activeLibraryCategoryShortLabel: string
  activeLibraryHeading: string
  activeLibraryDescription: string
  ActiveLibraryGroupIcon: LucideIcon
  ActiveLibraryCategoryIcon: LucideIcon
  activeTrainSubcategories: MidiLibraryCategory[]
  getSubcategoryMeta: (categoryId: string) => { icon: LucideIcon, shortLabel: string }
  visibleLibraryItems: MidiLibraryItem[]
  currentLibraryTrackId: string | null
  isLoadingLibrary: boolean
  listRef: Ref<HTMLDivElement>
  onSelectCategory: (categoryId: string) => void
  onSelectTrack: (item: MidiLibraryItem) => void
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {show && (
        <>
          <m.button
            key="library-scrim"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="fixed inset-0 z-40 bg-black/65 sm:bg-black/30"
            onClick={onClose}
            aria-label={copy.closeLibrary}
          />

          <m.div
            key="library-panel"
            role="dialog"
            aria-modal="true"
            initial={isMobile ? { y: '104%' } : { opacity: 0, y: -6, scale: 0.97 }}
            animate={isMobile ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={isMobile ? { y: '104%' } : { opacity: 0, y: -6, scale: 0.97 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : isMobile
                  ? { duration: 0.34, ease: [0.32, 0.72, 0, 1] }
                  : { duration: 0.2, ease: 'easeOut' }
            }
            className={cn(
              'nm-card pointer-events-auto fixed z-50 flex min-h-0 flex-col overflow-hidden text-[var(--nm-text)]',
              isMobile
                ? 'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[1.6rem] p-3'
                : 'absolute top-12 right-0 bottom-auto left-auto h-[min(74vh,46rem)] w-[min(38rem,calc(100vw-3rem))] rounded-[1.75rem] p-4',
            )}
            style={
              isMobile
                ? {
                    paddingBottom:
                                'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
                  }
                : undefined
            }
          >
            {isMobile && <div className="nm-sheet-handle" />}
            <div className="nm-well rounded-[1.2rem] p-3 sm:p-4">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-base font-semibold tracking-[0.06em] text-[var(--nm-text)] sm:text-lg">
                  {copy.libraryTitle}
                </h3>

                <button
                  type="button"
                  onClick={onClose}
                  className="nm-raised flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--nm-text-dim)] transition-colors hover:text-[var(--nm-text)]"
                  aria-label={copy.closeLibrary}
                >
                  <X className="h-[1.2rem] w-[1.2rem] sm:h-4 sm:w-4" />
                </button>
              </div>
            </div>

            <div
              className="mt-3 grid grid-cols-6 gap-1.5"
              role="tablist"
              aria-label={copy.libraryTabList}
            >
              {libraryPrimaryGroups.map((group) => {
                const isTabActive = activeLibraryGroup?.id === group.id
                const GroupIcon = group.icon

                return (
                  <button
                    key={group.id}
                    type="button"
                    role="tab"
                    aria-selected={isTabActive}
                    aria-label={group.label}
                    onClick={() =>
                      onSelectCategory(group.defaultCategoryId)}
                    title={group.label}
                    className={cn(
                      'flex min-h-10 min-w-0 items-center justify-center rounded-xl p-1.5 transition-all',
                      isTabActive
                        ? 'nm-toggle-active'
                        : 'nm-raised text-[var(--nm-text-dim)]',
                    )}
                  >
                    <GroupIcon
                      className={cn(
                        'h-[1.125rem] w-[1.125rem] shrink-0',
                        isTabActive
                          ? 'text-[var(--nm-bg)]'
                          : 'text-[var(--nm-text)]',
                      )}
                    />
                    <span className="sr-only">{group.shortLabel}</span>
                  </button>
                )
              })}
            </div>

            {activeTrainSubcategories.length > 0 && (
              <div
                className="mt-2 flex gap-2"
                role="tablist"
                aria-label={copy.trainSubcategories}
              >
                {activeTrainSubcategories.map((category) => {
                  const isSubtabActive
                    = category.id === activeLibraryCategoryId
                  const categoryMeta = getSubcategoryMeta(category.id)
                  const SubIcon = categoryMeta.icon

                  return (
                    <button
                      key={category.id}
                      type="button"
                      role="tab"
                      aria-selected={isSubtabActive}
                      aria-label={categoryMeta.shortLabel}
                      title={categoryMeta.shortLabel}
                      onClick={() =>
                        onSelectCategory(category.id)}
                      className={cn(
                        'flex h-10 w-14 shrink-0 items-center justify-center rounded-full transition-all',
                        isSubtabActive
                          ? 'nm-toggle-active'
                          : 'nm-raised text-[var(--nm-text-dim)]',
                      )}
                    >
                      <SubIcon className="h-4 w-4" />
                    </button>
                  )
                })}
              </div>
            )}

            {activeLibraryCategory && (
              <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.25rem] border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.01))] p-2 sm:p-3">
                <div className="px-2 py-1 sm:px-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--nm-text)]">
                      <ActiveLibraryGroupIcon className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {activeLibraryHeading}
                      </span>
                      {activeLibraryGroup
                        && activeLibraryGroup.categoryIds.length > 1 && (
                        <span className="rounded-full border border-white/8 bg-black/20 px-2 py-1 type-overline text-[var(--nm-text-faint)]">
                          {activeLibraryCategoryShortLabel}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--nm-text-dim)]">
                      {activeLibraryDescription}
                    </p>
                  </div>
                </div>

                <div
                  ref={listRef}
                  className="nm-scrollbar mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1 sm:pr-2"
                >
                  {visibleLibraryItems.length > 0
                    ? (
                        visibleLibraryItems.map((item) => {
                          const isActive
                            = currentLibraryTrackId === item.id

                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => onSelectTrack(item)}
                              disabled={isLoadingLibrary}
                              className={cn(
                                'nm-library-track flex w-full items-start gap-3 rounded-[1rem] px-3 py-3 text-left transition-all',
                                isActive
                                  ? 'nm-library-track-active'
                                  : 'nm-list-item text-[var(--nm-text-dim)]',
                                isLoadingLibrary && 'opacity-70',
                              )}
                            >
                              <span
                                className={cn(
                                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border',
                                  isActive
                                    ? 'border-white/8 bg-white text-[var(--nm-bg)] shadow-[0_10px_24px_rgba(0,0,0,0.35)]'
                                    : 'border-white/6 bg-white/[0.03] text-[var(--nm-text-dim)]',
                                )}
                              >
                                <ActiveLibraryCategoryIcon className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-start justify-between gap-2">
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold text-[var(--nm-text)]">
                                      {library?.getLocalizedTrackTitle(
                                        item,
                                        language,
                                      ) ?? item.title}
                                    </span>
                                    <span className="mt-1 flex items-center gap-1.5 truncate text-xs text-[var(--nm-text-faint)]">
                                      {library?.getLocalizedTrackSubtitle(
                                        item.subtitle,
                                        language,
                                      ) ?? item.subtitle}
                                      {item.sourceUrl && (
                                        <a
                                          href={item.sourceUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={e =>
                                            e.stopPropagation()}
                                          className="inline-flex shrink-0 text-white/70 transition-colors hover:text-white"
                                          aria-label="Source"
                                        >
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                      )}
                                    </span>
                                  </span>
                                  <span className="flex shrink-0 items-center gap-2">
                                    {isActive && (
                                      <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 type-overline text-[var(--nm-text)]">
                                        {copy.loaded}
                                      </span>
                                    )}
                                    <span className="rounded-full border border-white/8 bg-black/20 px-2 py-1 type-overline text-[var(--nm-text-faint)]">
                                      {item.durationLabel}
                                    </span>
                                  </span>
                                </span>
                              </span>
                            </button>
                          )
                        })
                      )
                    : (
                        <div className="flex flex-1 flex-col items-center justify-center rounded-[1.15rem] border border-dashed border-white/10 bg-black/10 px-6 text-center">
                          <ActiveLibraryCategoryIcon className="mb-3 h-6 w-6 text-[var(--nm-text-faint)]" />
                          <h4 className="text-sm font-semibold text-[var(--nm-text)]">
                            {copy.noTracksTitle(activeLibraryHeading)}
                          </h4>
                          <p className="mt-2 max-w-xs text-xs leading-relaxed text-[var(--nm-text-dim)]">
                            {copy.noTracksDescription}
                          </p>
                        </div>
                      )}
                  {activeLibraryCategory?.id === 'originals' && (
                    <p className="mt-3 px-3 text-xs leading-relaxed text-[var(--nm-text-faint)]">
                      {language === 'ja'
                        ? (
                            <>
                              作曲していますか？あなたのMIDIファイルを
                              <a
                                href="https://x.com/itsjaydesu"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline text-[var(--nm-text-dim)] hover:text-[var(--nm-text)] transition-colors"
                              >
                                Xでお送りください
                              </a>
                              。確認のうえ追加いたします。
                            </>
                          )
                        : (
                            <>
                              Are you a composer? If you&#39;d like to add
                              your MIDI file here, please
                              {' '}
                              <a
                                href="https://x.com/itsjaydesu"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline text-[var(--nm-text-dim)] hover:text-[var(--nm-text)] transition-colors"
                              >
                                message me on X
                              </a>
                              {' '}
                              with your MIDI, and I&#39;ll review and add
                              when I can.
                            </>
                          )}
                    </p>
                  )}
                </div>
              </div>
            )}
          </m.div>
        </>
      )}
    </AnimatePresence>
  )
}
