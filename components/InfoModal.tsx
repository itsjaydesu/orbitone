'use client'

import type { Ref } from 'react'
import type { AppLanguage } from '@/lib/camera-presets'
import type { ShortcutItem, UiCopy } from '@/lib/i18n'
import { AnimatePresence, m } from 'motion/react'
import Image from 'next/image'
import { GitHubMark, XMark } from '@/components/BrandMarks'
import { cn } from '@/lib/utils'

const infoOverlayStyle = {
  paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
  paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)',
} as const

const infoModalStyle = {
  maxHeight:
    'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 2rem)',
} as const

export function InfoModal({
  show,
  language,
  copy,
  displayBrandName,
  keyboardShortcuts,
  isMobile,
  reduceMotion,
  panelRef,
  onClose,
}: {
  show: boolean
  language: AppLanguage
  copy: UiCopy
  displayBrandName: string
  keyboardShortcuts: ShortcutItem[]
  isMobile: boolean
  reduceMotion: boolean
  panelRef: Ref<HTMLDivElement>
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {show && (
        <m.div
          key="info-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          className="fixed inset-0 z-[60] overflow-y-auto bg-black/80"
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          style={infoOverlayStyle}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onClose()
            }
          }}
        >
          <div
            className="flex min-h-full items-center justify-center p-4"
          >
            <m.div
              key="info-card"
              ref={panelRef}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeOut' }}
              className={cn(
                'w-full overflow-y-auto rounded-[1.5rem] border border-white/12 bg-[#070707] font-mono text-[var(--nm-text)] shadow-[0_28px_80px_rgba(0,0,0,0.6)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                isMobile ? 'max-w-full px-5 py-5' : 'max-w-[42rem] px-7 py-6',
              )}
              style={infoModalStyle}
            >
              <div className="space-y-7 text-sm leading-[1.9] text-[var(--nm-text-dim)]">
                <section className="space-y-5">
                  <p className="text-[1.8rem] leading-none tracking-[0.04em] text-[var(--nm-text)]">
                    {displayBrandName}
                    {' '}
                    <a
                      href="https://github.com/itsjaydesu/orbitone"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex translate-y-[0.1em] align-baseline text-[var(--nm-text-dim)] transition-colors hover:text-[var(--nm-text)]"
                      aria-label="GitHub"
                    >
                      <GitHubMark className="h-[1.5625rem] w-[1.5625rem]" />
                    </a>
                    {' '}
                    <span className="text-[var(--nm-text-dim)]">
                      by
                      {' '}
                      <a
                        href="https://x.com/itsjaydesu"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                      >
                        @itsjaydesu
                      </a>
                    </span>
                  </p>

                  <div className="p-4 sm:p-5">
                    <div className="space-y-4">
                      {language === 'ja'
                        ? (
                            <>
                              <p>
                                <strong className="font-semibold text-[var(--nm-text)]">
                                  {displayBrandName}
                                </strong>
                                は私の初めてのオープンソースプロジェクトです。MIDIファイルを、ミニマルで心地よいビジュアルのミュージックボックスに変えることを目指しています。
                              </p>

                              <p>
                                <span className="mx-1 inline-flex min-w-7 items-center justify-center rounded-sm border border-white/20 px-1.5 py-0 text-[11px] font-semibold tracking-[0.16em] text-[var(--nm-text)] uppercase">
                                  C
                                </span>
                                でカメラアングルの切り替え、
                                <span className="mx-1 inline-flex min-w-7 items-center justify-center rounded-sm border border-white/20 px-1.5 py-0 text-[11px] font-semibold tracking-[0.16em] text-[var(--nm-text)] uppercase">
                                  M
                                </span>
                                でMIDIロールを表示できます。
                              </p>

                              <p>
                                MIDIファイルにはちょっとした懐かしさがあります。楽しんでもらえたらうれしいです。
                              </p>

                              <p>
                                このプロジェクトは自由に使ってください。何か作ったら、ぜひ見せてください。改善のアイデアがあれば、プルリクエストを送ってもらえるとうれしいです！
                              </p>
                            </>
                          )
                        : (
                            <>
                              <p>
                                <strong className="font-semibold text-[var(--nm-text)]">
                                  {displayBrandName}
                                </strong>
                                {' '}
                                is my first open source project. The goal is turning
                                a MIDI file into a minimal and pleasantly visualized
                                music box.
                              </p>

                              <p>
                                Try pressing
                                {' '}
                                <span className="mx-1 inline-flex min-w-7 items-center justify-center rounded-sm border border-white/20 px-1.5 py-0 text-[11px] font-semibold tracking-[0.16em] text-[var(--nm-text)] uppercase">
                                  C
                                </span>
                                {' '}
                                for different camera angles and
                                {' '}
                                <span className="mx-1 inline-flex min-w-7 items-center justify-center rounded-sm border border-white/20 px-1.5 py-0 text-[11px] font-semibold tracking-[0.16em] text-[var(--nm-text)] uppercase">
                                  M
                                </span>
                                {' '}
                                for a MIDI roll.
                              </p>

                              <p>
                                There&apos;s some nice nostalgia in the MIDI files,
                                hope you enjoy.
                              </p>

                              <p>
                                Please use this project for anything you like. If you
                                make something with it, I&apos;d love to see it. If
                                you have ideas on how to improve it, shoot me a pull
                                request!
                              </p>
                            </>
                          )}
                    </div>
                  </div>
                </section>

                <section className="space-y-4 border-t border-white/12 pt-5">
                  <h3 className="text-base tracking-[0.08em] text-[var(--nm-text)]">
                    {copy.keyboardShortcutsTitle}
                  </h3>
                  <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                    {keyboardShortcuts.map(shortcut => (
                      <div
                        key={shortcut.keyLabel}
                        className="flex items-baseline gap-4"
                      >
                        <span className="min-w-[4.75rem] shrink-0 text-[var(--nm-text)]">
                          [
                          {shortcut.keyLabel}
                          ]
                        </span>
                        <span className="text-[13px] text-[var(--nm-text-dim)]">
                          {shortcut.description}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-4 border-t border-white/12 pt-5">
                  <h3 className="text-base tracking-[0.08em] text-[var(--nm-text)]">
                    {language === 'ja' ? 'クレジット' : 'Credits'}
                  </h3>
                  <div className="space-y-4 text-xs leading-[1.8] text-[var(--nm-text-dim)]">
                    {language === 'ja'
                      ? (
                          <>
                            <div>
                              <p className="text-[var(--nm-text)]">
                                <a
                                  href="https://shtr-m.net/"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                                >
                                  shtr-m.net
                                </a>
                              </p>
                              <p>
                                日本の鉄道駅の発車メロディ（発メロ）のアーカイブです。
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--nm-text)]">
                                <a
                                  href="https://bitmidi.com"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                                >
                                  BitMidi
                                </a>
                              </p>
                              <p>
                                ゲーム、映画、テレビなどのクラシックMIDIファイルのコミュニティアーカイブです。
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--nm-text)]">
                                <a
                                  href="https://www.vgmusic.com"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                                >
                                  VGMusic
                                </a>
                              </p>
                              <p>
                                1996年から続くビデオゲーム音楽のMIDIアーカイブです。
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--nm-text)]">
                                <a
                                  href="https://magenta.tensorflow.org/datasets/maestro"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                                >
                                  MAESTRO Dataset
                                </a>
                              </p>
                              <p>
                                Google Magentaによる「MIDI and Audio Edited for
                                Synchronous TRacks and
                                Organization」データセットです。国際ピアノeコンペティションの演奏から収録された、ベロシティやペダル情報を含む高品質なピアノMIDI録音です。
                              </p>
                            </div>
                          </>
                        )
                      : (
                          <>
                            <div>
                              <p className="text-[var(--nm-text)]">
                                <a
                                  href="https://shtr-m.net/"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                                >
                                  shtr-m.net
                                </a>
                              </p>
                              <p>
                                Japanese train station departure melodies (hassha
                                melody) sourced from this railfan archive.
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--nm-text)]">
                                <a
                                  href="https://bitmidi.com"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                                >
                                  BitMidi
                                </a>
                              </p>
                              <p>
                                A community archive of classic MIDI files spanning
                                games, film, and television.
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--nm-text)]">
                                <a
                                  href="https://www.vgmusic.com"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                                >
                                  VGMusic
                                </a>
                              </p>
                              <p>
                                A video game music MIDI archive running since 1996.
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--nm-text)]">
                                <a
                                  href="https://magenta.tensorflow.org/datasets/maestro"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-white/30 underline-offset-2 transition-colors hover:text-white"
                                >
                                  MAESTRO Dataset
                                </a>
                              </p>
                              <p>
                                The &quot;MIDI and Audio Edited for Synchronous TRacks
                                and Organization&quot; dataset by Google Magenta.
                                High-fidelity piano MIDI recordings captured from
                                International Piano-e-Competition performances, with
                                velocity and pedal data intact.
                              </p>
                            </div>
                          </>
                        )}
                  </div>
                </section>

                <section className="space-y-4 border-t border-white/12 pt-5">
                  <h3 className="text-base tracking-[0.08em] text-[var(--nm-text)]">
                    {language === 'ja' ? '今後やりたいこと' : 'Things That Might Be Next'}
                  </h3>
                  <div className="space-y-2 text-xs leading-[1.8] text-[var(--nm-text-dim)]">
                    {language === 'ja'
                      ? (
                          <ul className="list-inside list-disc space-y-1">
                            <li>散らかっている部分のリファクタリング</li>
                            <li>
                              ピアノ以外の楽器を追加する（シンセ、ストリングスなど）
                            </li>
                            <li>
                              本物のアコースティックピアノの音源を使った、よりオーガニックなサウンド
                            </li>
                            <li>マルチトラックMIDIのサポートとトラック別の可視化</li>
                            <li>プレイリスト・キュー機能</li>
                          </ul>
                        )
                      : (
                          <ul className="list-inside list-disc space-y-1">
                            <li>Some refactors to clean up some messy parts</li>
                            <li>
                              Additional instruments (synth, strings, etc.)
                            </li>
                            <li>
                              Authentic organic piano using real acoustic samples
                            </li>
                            <li>
                              Multi-track MIDI support with per-track visualization
                            </li>
                            <li>Playlist queue for continuous playback</li>
                          </ul>
                        )}
                  </div>
                </section>

                <section className="flex items-center justify-center gap-5 border-t border-white/12 pt-5">
                  <a
                    href="https://github.com/itsjaydesu"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--nm-text-dim)] transition-colors hover:text-white"
                    aria-label="GitHub"
                    title="GitHub"
                  >
                    <GitHubMark className="h-8 w-8" />
                  </a>
                  <a
                    href="https://itsjaydesu.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 overflow-hidden rounded-full border-2 border-white/20 bg-black/40 shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-opacity hover:opacity-80"
                    aria-label={language === 'ja' ? 'サイト' : 'Website'}
                    title={language === 'ja' ? 'サイト' : 'Website'}
                  >
                    <Image
                      src="/jay-avatar.PNG"
                      alt="Portrait of itsjaydesu"
                      width={128}
                      height={128}
                      className="h-12 w-12 object-cover"
                    />
                  </a>
                  <a
                    href="https://x.com/itsjaydesu"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--nm-text-dim)] transition-colors hover:text-white"
                    aria-label="X"
                    title="X"
                  >
                    <XMark className="h-8 w-8" />
                  </a>
                </section>
              </div>
            </m.div>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
