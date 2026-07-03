'use client'

import type { ReactNode, Ref } from 'react'
import type { AppLanguage, CameraView } from '@/lib/camera-presets'
import type { InstrumentId } from '@/lib/instruments'
import { Expand, Minimize } from 'lucide-react'
import { useState } from 'react'
import { getInstrument, INSTRUMENT_LIST } from '@/lib/instruments'
import { cn } from '@/lib/utils'

export interface SettingsPanelCopy {
  settings: string
  tabSound: string
  tabScene: string
  tabExport: string
  tabGeneral: string
  instrument: string
  volume: string
  cameraView: string
  cameraAutoCycle: string
  midiRoll: string
  bottomTrackMeta: string
  fullScreen: string
  language: string
  resetDefaults: string
  on: string
  off: string
}

type SettingsTab = 'sound' | 'scene' | 'export' | 'general'

interface SettingsPanelProps {
  panelRef: Ref<HTMLDivElement>
  language: AppLanguage
  copy: SettingsPanelCopy
  isMobile: boolean
  isFullscreen: boolean
  onToggleFullscreen: () => void
  // Sound
  instrumentId: InstrumentId
  onInstrumentChange: (id: InstrumentId) => void
  bpm: number
  onBpmChange: (value: number) => void
  volumePercent: number
  onVolumeChange: (value: number) => void
  // Scene
  showMidiRoll: boolean
  onToggleMidiRoll: () => void
  showBottomTrackMeta: boolean
  onToggleBottomTrackMeta: () => void
  cameraView: CameraView
  cameraViews: readonly CameraView[]
  cameraViewLabels: Record<CameraView, string>
  onCameraViewChange: (view: CameraView) => void
  autoCycleCamera: boolean
  onToggleAutoCycle: () => void
  // General
  languageOptions: ReadonlyArray<{ value: AppLanguage, label: string }>
  onLanguageChange: (language: AppLanguage) => void
  onReset: () => void
  // Export
  showExportTab: boolean
  renderVideoExport?: (visible: boolean) => ReactNode
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--nm-text-faint)]">
      {children}
    </span>
  )
}

function ToggleRow({
  label,
  active,
  onToggle,
  onLabel,
  offLabel,
}: {
  label: string
  active: boolean
  onToggle: () => void
  onLabel: string
  offLabel: string
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        onToggle()
        e.currentTarget.blur()
      }}
      className={cn(
        'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all',
        active ? 'nm-toggle-active' : 'nm-raised text-[var(--nm-text)]',
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          'rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
          active ? 'text-[var(--nm-bg)]' : 'text-[var(--nm-text-dim)]',
        )}
      >
        {active ? onLabel : offLabel}
      </span>
    </button>
  )
}

function SliderRow({
  label,
  value,
  valueLabel,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  valueLabel: string
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-[var(--nm-text-dim)]">
        <span>{label}</span>
        <span>{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number.parseInt(e.target.value, 10))}
        className="nm-range"
      />
    </div>
  )
}

function SegmentedControl<T extends string>({
  options,
  value,
  columns,
  onChange,
}: {
  options: ReadonlyArray<{ value: T, label: string }>
  value: T
  columns: 2 | 3
  onChange: (value: T) => void
}) {
  return (
    <div className={cn('grid gap-2', columns === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={(e) => {
            onChange(option.value)
            e.currentTarget.blur()
          }}
          className={cn(
            'rounded-xl px-2 py-1.5 text-xs font-medium transition-all',
            value === option.value
              ? 'nm-toggle-active'
              : 'nm-raised text-[var(--nm-text-dim)]',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function InstrumentPicker({
  instrumentId,
  language,
  onChange,
}: {
  instrumentId: InstrumentId
  language: AppLanguage
  onChange: (id: InstrumentId) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {INSTRUMENT_LIST.map((instrument) => {
        const Icon = instrument.icon
        const active = instrument.id === instrumentId

        return (
          <button
            key={instrument.id}
            type="button"
            title={instrument.blurb[language]}
            onClick={(e) => {
              onChange(instrument.id)
              e.currentTarget.blur()
            }}
            className={cn(
              'flex flex-col items-start gap-1.5 rounded-xl px-3 py-2.5 text-left transition-all',
              active ? 'nm-toggle-active' : 'nm-raised text-[var(--nm-text)]',
            )}
          >
            <Icon className="h-[1.15rem] w-[1.15rem]" />
            <span className="text-xs font-medium leading-tight">
              {instrument.label[language]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function SettingsPanel({
  panelRef,
  language,
  copy,
  isMobile,
  isFullscreen,
  onToggleFullscreen,
  instrumentId,
  onInstrumentChange,
  bpm,
  onBpmChange,
  volumePercent,
  onVolumeChange,
  showMidiRoll,
  onToggleMidiRoll,
  showBottomTrackMeta,
  onToggleBottomTrackMeta,
  cameraView,
  cameraViews,
  cameraViewLabels,
  onCameraViewChange,
  autoCycleCamera,
  onToggleAutoCycle,
  languageOptions,
  onLanguageChange,
  onReset,
  showExportTab,
  renderVideoExport,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('sound')

  const tabs: ReadonlyArray<{ id: SettingsTab, label: string }> = [
    { id: 'sound', label: copy.tabSound },
    { id: 'scene', label: copy.tabScene },
    ...(showExportTab ? [{ id: 'export' as const, label: copy.tabExport }] : []),
    { id: 'general', label: copy.tabGeneral },
  ]

  const activeInstrument = getInstrument(instrumentId)

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={copy.settings}
      className="nm-card nm-animate-dropdown pointer-events-auto absolute top-12 right-0 z-50 flex w-80 flex-col gap-3 rounded-xl p-4 text-[var(--nm-text)]"
    >
      <div className="nm-well nm-tabs-rail flex gap-1 rounded-xl p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={(e) => {
              setActiveTab(tab.id)
              e.currentTarget.blur()
            }}
            aria-pressed={activeTab === tab.id}
            className={cn(
              'flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all',
              activeTab === tab.id
                ? 'nm-toggle-active'
                : 'text-[var(--nm-text-dim)] hover:text-[var(--nm-text)]',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Sound ── */}
      <div className={cn('flex-col gap-3', activeTab === 'sound' ? 'flex' : 'hidden')}>
        <div className="flex flex-col gap-2">
          <FieldLabel>{copy.instrument}</FieldLabel>
          <InstrumentPicker
            instrumentId={instrumentId}
            language={language}
            onChange={onInstrumentChange}
          />
          <p className="text-[11px] leading-snug text-[var(--nm-text-faint)]">
            {activeInstrument.blurb[language]}
          </p>
        </div>

        <SliderRow
          label="BPM"
          value={bpm}
          valueLabel={String(bpm)}
          min={30}
          max={300}
          step={1}
          onChange={onBpmChange}
        />

        <SliderRow
          label={copy.volume}
          value={volumePercent}
          valueLabel={`${volumePercent}%`}
          min={0}
          max={150}
          step={1}
          onChange={onVolumeChange}
        />
      </div>

      {/* ── Scene ── */}
      <div className={cn('flex-col gap-3', activeTab === 'scene' ? 'flex' : 'hidden')}>
        {!isMobile && (
          <button
            type="button"
            onClick={(e) => {
              onToggleFullscreen()
              e.currentTarget.blur()
            }}
            className={cn(
              'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
              isFullscreen ? 'nm-toggle-active' : 'nm-raised text-[var(--nm-text)]',
            )}
          >
            <span className="flex items-center gap-2">
              {isFullscreen
                ? <Minimize className="h-[1.2rem] w-[1.2rem] sm:h-4 sm:w-4" />
                : <Expand className="h-[1.2rem] w-[1.2rem] sm:h-4 sm:w-4" />}
              {copy.fullScreen}
            </span>
            <kbd
              className={cn(
                'rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                isFullscreen ? 'text-[var(--nm-bg)]' : 'text-[var(--nm-text-dim)]',
              )}
            >
              F
            </kbd>
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <ToggleRow
            label={copy.midiRoll}
            active={showMidiRoll}
            onToggle={onToggleMidiRoll}
            onLabel={copy.on}
            offLabel={copy.off}
          />
          <ToggleRow
            label={copy.bottomTrackMeta}
            active={showBottomTrackMeta}
            onToggle={onToggleBottomTrackMeta}
            onLabel={copy.on}
            offLabel={copy.off}
          />
        </div>

        <div className="flex flex-col gap-2">
          <FieldLabel>{copy.cameraView}</FieldLabel>
          <SegmentedControl
            options={cameraViews.map(view => ({
              value: view,
              label: cameraViewLabels[view],
            }))}
            value={cameraView}
            columns={3}
            onChange={onCameraViewChange}
          />
          <ToggleRow
            label={copy.cameraAutoCycle}
            active={autoCycleCamera}
            onToggle={onToggleAutoCycle}
            onLabel={copy.on}
            offLabel={copy.off}
          />
        </div>
      </div>

      {/*
        Export tab: rendered as a direct flex child so its controls line up with
        the panel's gaps when active. VideoExportDevTools hides only its own
        controls off-tab (via `visible`), keeping the offscreen capture rig and
        overlay mounted so exports are never interrupted by a tab switch.
      */}
      {showExportTab && renderVideoExport?.(activeTab === 'export')}

      {/* ── General ── */}
      <div className={cn('flex-col gap-3', activeTab === 'general' ? 'flex' : 'hidden')}>
        <div className="flex flex-col gap-2">
          <FieldLabel>{copy.language}</FieldLabel>
          <SegmentedControl
            options={languageOptions.map(option => ({
              value: option.value,
              label: option.label,
            }))}
            value={language}
            columns={2}
            onChange={onLanguageChange}
          />
        </div>

        <button
          type="button"
          onClick={(e) => {
            onReset()
            e.currentTarget.blur()
          }}
          className="nm-destructive w-full rounded-xl py-2 text-sm font-medium"
        >
          {copy.resetDefaults}
        </button>
      </div>
    </div>
  )
}
