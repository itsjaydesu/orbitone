import type { LucideIcon } from 'lucide-react'
import type { AppLanguage } from '@/lib/camera-presets'
import {
  BellRing,
  Clapperboard,
  Disc3,
  Feather,
  Gamepad2,
  Map as MapIcon,
  Music,
  Piano,
  TrainFront,
} from 'lucide-react'

export interface LibraryCategoryMeta {
  blurb: string
  icon: LucideIcon
  label: string
  shortLabel: string
}

export interface LibraryPrimaryGroup {
  blurb: string
  categoryIds: string[]
  defaultCategoryId: string
  icon: LucideIcon
  id: string
  label: string
  shortLabel: string
}

const TRAIN_LIBRARY_CATEGORY_IDS = [
  'train-signature-system',
  'train-stations',
  'train-standard-chimes',
] as const

export const FEATURED_LIBRARY_ORDER = new Map([
  ['games-internet/theme-song-to-2008', 0],
])

export function getLibraryCategoryMeta(categoryId: string, language: AppLanguage): LibraryCategoryMeta {
  switch (categoryId) {
    case 'originals':
      return language === 'ja'
        ? {
            blurb: 'コミュニティから寄せられたオリジナル楽曲です。',
            icon: Feather,
            label: 'オリジナル',
            shortLabel: 'オリジナル',
          }
        : {
            blurb: 'Original compositions from the community.',
            icon: Feather,
            label: 'Originals',
            shortLabel: 'Originals',
          }
    case 'classical-piano':
      return language === 'ja'
        ? {
            blurb:
              '夜想曲や協奏曲など、ピアノの表情がよく映えるクラシック作品を集めました。',
            icon: Piano,
            label: 'クラシック / ピアノ',
            shortLabel: 'クラシック',
          }
        : {
            blurb: 'Concert works, nocturnes, and expressive piano repertoire.',
            icon: Piano,
            label: 'Classical & Piano',
            shortLabel: 'Classical',
          }
    case 'film-tv-anime':
      return language === 'ja'
        ? {
            blurb:
              '映画音楽、アニメ主題歌、印象的なテレビテーマを横断する映像音楽のコレクションです。',
            icon: Clapperboard,
            label: '映画 / テレビ / アニメ',
            shortLabel: '映像',
          }
        : {
            blurb: 'Big-screen themes, anime openings, and prestige TV motifs.',
            icon: Clapperboard,
            label: 'Film, TV & Anime',
            shortLabel: 'Screen',
          }
    case 'games-internet':
      return language === 'ja'
        ? {
            blurb:
              'ゲームの名曲やインターネットの記憶に残るメロディを、少しノスタルジックな温度感で。',
            icon: Gamepad2,
            label: 'ゲーム / インターネット',
            shortLabel: 'ゲーム',
          }
        : {
            blurb:
              'Game scores, online relics, and endlessly replayable hooks.',
            icon: Gamepad2,
            label: 'Games & Internet',
            shortLabel: 'Games',
          }
    case 'pop-electronic':
      return language === 'ja'
        ? {
            blurb:
              'ポップスの定番やエレクトロのきらめきを、ピアノで気持ちよく聴ける曲たちです。',
            icon: Disc3,
            label: 'ポップ / エレクトロ',
            shortLabel: 'ポップ',
          }
        : {
            blurb: 'Anthems, club textures, and bright electronic melodies.',
            icon: Disc3,
            label: 'Pop & Electronic',
            shortLabel: 'Pop',
          }
    case 'train-stations':
      return language === 'ja'
        ? {
            blurb:
              '駅ごとの発車メロディやご当地色のあるチャイムを中心に集めています。',
            icon: TrainFront,
            label: '駅別メロディ',
            shortLabel: '駅別',
          }
        : {
            blurb:
              'Station-specific Japanese departure melodies and local favorites.',
            icon: TrainFront,
            label: 'Station Melodies',
            shortLabel: 'Stations',
          }
    case 'train-standard-chimes':
      return language === 'ja'
        ? {
            blurb:
              'JRの定番チャイムや広く使われる標準メロディをまとめたセットです。',
            icon: BellRing,
            label: '定番チャイム',
            shortLabel: '定番',
          }
        : {
            blurb:
              'Classic JR standards, shared chimes, and core platform signals.',
            icon: BellRing,
            label: 'Standard Chimes',
            shortLabel: 'Chimes',
          }
    case 'train-signature-system':
      return language === 'ja'
        ? {
            blurb:
              '路線固有のメロディや有名な発車サウンド、印象に残るシグネチャー曲を揃えました。',
            icon: MapIcon,
            label: 'シグネチャー曲',
            shortLabel: '特色',
          }
        : {
            blurb:
              'Named rail melodies, medleys, and signature network themes.',
            icon: MapIcon,
            label: 'Signature Themes',
            shortLabel: 'Signature',
          }
    default:
      return language === 'ja'
        ? {
            blurb: 'Orbitoneのために選んだMIDIコレクションです。',
            icon: Music,
            label: 'MIDIライブラリ',
            shortLabel: 'ライブラリ',
          }
        : {
            blurb: 'Curated MIDI selections from the Orbitone library.',
            icon: Music,
            label: 'MIDI Library',
            shortLabel: 'Library',
          }
  }
}

export function getLibraryPrimaryGroups(language: AppLanguage): LibraryPrimaryGroup[] {
  const singleCategoryGroup = (id: string): LibraryPrimaryGroup => {
    const meta = getLibraryCategoryMeta(id, language)

    return {
      id,
      label: meta.label,
      shortLabel: meta.shortLabel,
      icon: meta.icon,
      blurb: meta.blurb,
      categoryIds: [id],
      defaultCategoryId: id,
    }
  }

  return [
    singleCategoryGroup('originals'),
    singleCategoryGroup('classical-piano'),
    singleCategoryGroup('film-tv-anime'),
    singleCategoryGroup('games-internet'),
    singleCategoryGroup('pop-electronic'),
    {
      id: 'japanese-train-melodies',
      label: language === 'ja' ? '日本の発車メロディ' : 'Japanese Train Melodies',
      shortLabel: language === 'ja' ? '鉄道' : 'Trains',
      icon: TrainFront,
      blurb:
        language === 'ja'
          ? '駅別の発車メロディ、JRの定番チャイム、路線のシグネチャー曲まで、日本の鉄道音を横断できます。'
          : 'Station jingles, JR standards, and signature departure themes from across Japan\'s rail network.',
      categoryIds: [...TRAIN_LIBRARY_CATEGORY_IDS],
      defaultCategoryId: 'train-stations',
    },
  ]
}
