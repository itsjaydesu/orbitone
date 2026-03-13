import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import midiPackage from '@tonejs/midi';

const { Midi } = midiPackage;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const CATEGORY_DEFINITIONS = [
  { id: 'classical-piano', label: 'Classical & Piano' },
  { id: 'film-tv-anime', label: 'Film, TV & Anime' },
  { id: 'games-internet', label: 'Games & Internet' },
  { id: 'pop-electronic', label: 'Pop & Electronic' },
  { id: 'train-stations', label: 'Japanese Train Melodies: Stations' },
  { id: 'train-standard-chimes', label: 'Japanese Train Melodies: Standard Chimes' },
  {
    id: 'train-signature-system',
    label: 'Japanese Train Melodies: Signature, Rail & Medleys',
  },
];

const CATEGORY_LABELS = new Map(
  CATEGORY_DEFINITIONS.map((category) => [category.id, category.label]),
);

const ROOT_LIBRARY_ENTRIES = [
  {
    source: 'Bach - Prelude from Cello Suite.midi',
    categoryId: 'classical-piano',
    slug: 'bach-prelude-from-cello-suite',
    title: 'Prelude from Cello Suite',
    subtitle: 'Johann Sebastian Bach',
  },
  {
    source: 'Beethoven-Moonlight-Sonata.mid',
    categoryId: 'classical-piano',
    slug: 'beethoven-moonlight-sonata',
    title: 'Moonlight Sonata',
    subtitle: 'Ludwig van Beethoven',
  },
  {
    source: 'mozart-piano-concerto-21-2-elvira-madigan-piano-solo.mid',
    categoryId: 'classical-piano',
    slug: 'mozart-piano-concerto-no-21-elvira-madigan',
    title: 'Piano Concerto No. 21 (Elvira Madigan)',
    subtitle: 'Wolfgang Amadeus Mozart',
  },
  {
    source: 'Tchaikovsky - Swan Lake LIVE.midi',
    categoryId: 'classical-piano',
    slug: 'tchaikovsky-swan-lake',
    title: 'Swan Lake',
    subtitle: 'Pyotr Ilyich Tchaikovsky',
  },
  {
    source: 'Yiruma - River Flows in You LIVE.mid',
    categoryId: 'classical-piano',
    slug: 'yiruma-river-flows-in-you',
    title: 'River Flows in You',
    subtitle: 'Yiruma',
  },
  {
    source: 'Evangelion - Cruel Angel\'s Thesis.mid',
    categoryId: 'film-tv-anime',
    slug: 'evangelion-cruel-angels-thesis',
    title: 'Cruel Angel\'s Thesis',
    subtitle: 'Yoko Takahashi',
  },
  {
    source: 'Nuovo Cinema Paradiso - LIVE.mid',
    categoryId: 'film-tv-anime',
    slug: 'nuovo-cinema-paradiso',
    title: 'Nuovo Cinema Paradiso',
    subtitle: 'Ennio Morricone',
  },
  {
    source: 'simpsons-theme.mid',
    categoryId: 'film-tv-anime',
    slug: 'the-simpsons-theme',
    title: 'The Simpsons Theme',
    subtitle: 'Danny Elfman',
  },
  {
    source: 'Star Wars Theme - LIVE.mid',
    categoryId: 'film-tv-anime',
    slug: 'star-wars-theme',
    title: 'Star Wars Theme',
    subtitle: 'John Williams',
  },
  {
    source: 'star-wars-imperial-march.mid',
    categoryId: 'film-tv-anime',
    slug: 'star-wars-imperial-march',
    title: 'Imperial March',
    subtitle: 'John Williams',
  },
  {
    source: 'succession-theme.mid',
    categoryId: 'film-tv-anime',
    slug: 'succession-theme',
    title: 'Succession Theme',
    subtitle: 'Nicholas Britell',
  },
  {
    source: '23_Chrono_Trigger_Main_Theme.mid',
    categoryId: 'games-internet',
    slug: 'chrono-trigger-main-theme',
    title: 'Chrono Trigger Main Theme',
    subtitle: 'Yasunori Mitsuda',
  },
  {
    source: 'ducktales-moon-theme.mid',
    categoryId: 'games-internet',
    slug: 'ducktales-moon-theme',
    title: 'DuckTales Moon Theme',
    subtitle: 'DuckTales',
  },
  {
    source: 'Bubble Bobble.mid',
    categoryId: 'games-internet',
    slug: 'bubble-bobble',
    title: 'Bubble Bobble',
    subtitle: 'Taito',
  },
  {
    source: 'C418 - Sweden.mid',
    categoryId: 'games-internet',
    slug: 'sweden',
    title: 'Sweden',
    subtitle: 'C418 / Minecraft',
  },
  {
    source: 'C418 - Subwoofer Lullaby.mid',
    categoryId: 'games-internet',
    slug: 'subwoofer-lullaby',
    title: 'Subwoofer Lullaby',
    subtitle: 'C418 / Minecraft',
  },
  {
    source: 'mii-channel-theme.mid',
    categoryId: 'games-internet',
    slug: 'mii-channel-theme',
    title: 'Mii Channel Theme',
    subtitle: 'Nintendo Wii',
  },
  {
    source: 'nyan-cat.mid',
    categoryId: 'games-internet',
    slug: 'nyan-cat',
    title: 'Nyan Cat',
    subtitle: 'Internet Classic',
  },
  {
    source: 'Portal - Still Alive.mid',
    categoryId: 'games-internet',
    slug: 'portal-still-alive',
    title: 'Still Alive',
    subtitle: 'Portal / Jonathan Coulton',
  },
  {
    source: 'Tetris - Tetris Main Theme.mid',
    categoryId: 'games-internet',
    slug: 'tetris-main-theme',
    title: 'Tetris Main Theme',
    subtitle: 'Tetris',
  },
  {
    source: 'theme-song-to-2008.midi',
    categoryId: 'games-internet',
    slug: 'theme-song-to-2008',
    title: 'Theme Song to 2008',
    subtitle: 'Unknown Artist',
  },
  {
    source: 'Coldplay - A Sky Full of Stars LIVE.mid',
    categoryId: 'pop-electronic',
    slug: 'coldplay-a-sky-full-of-stars',
    title: 'A Sky Full of Stars',
    subtitle: 'Coldplay',
  },
  {
    source: 'Owl City - Fireflies.mid',
    categoryId: 'pop-electronic',
    slug: 'fireflies',
    title: 'Fireflies',
    subtitle: 'Owl City',
  },
  {
    source: 'Billy Joel - Piano Man.mid',
    categoryId: 'pop-electronic',
    slug: 'piano-man',
    title: 'Piano Man',
    subtitle: 'Billy Joel',
  },
  {
    source: 'The Beatles - Yesterday.mid',
    categoryId: 'pop-electronic',
    slug: 'yesterday',
    title: 'Yesterday',
    subtitle: 'The Beatles',
  },
  {
    source: 'kernkraft-400.mid',
    categoryId: 'pop-electronic',
    slug: 'kernkraft-400',
    title: 'Kernkraft 400',
    subtitle: 'Zombie Nation',
  },
];

const TRAIN_SECTION_CONFIG = {
  '01_Yamanote_Line_Stations': {
    categoryId: 'train-stations',
    subtitle: 'Yamanote Line Station',
  },
  '02_Other_Tokyo_Stations': {
    categoryId: 'train-stations',
    subtitle: 'Tokyo Area Station',
  },
  '03_JR-SH_Standard_Melodies': {
    categoryId: 'train-standard-chimes',
    subtitle: 'JR-SH Standard Melody',
  },
  '04_Famous_Named_Melodies': {
    categoryId: 'train-signature-system',
    subtitle: 'Named Train Melody',
  },
  '05_Shinkansen_Chimes': {
    categoryId: 'train-signature-system',
    subtitle: 'Shinkansen Chime',
  },
  '06_Metro_and_Private_Railways': {
    categoryId: 'train-signature-system',
    subtitle: 'Metro / Private Railway Melody',
  },
  '07_Medleys_and_Misc': {
    categoryId: 'train-signature-system',
    subtitle: 'Railway Medley / Misc',
  },
};

const EXCLUDED_TRAIN_GROUP_KEYS = new Set([
  '07_Medleys_and_Misc/Yamanote_Full_Medley',
]);

function findSourceRoot() {
  const candidates = ['set-source', 'set']
    .map((dirName) => path.join(projectRoot, dirName))
    .filter((dirPath) => fs.existsSync(dirPath));

  if (candidates.length === 0) {
    throw new Error('Could not find `set-source` or `set` in the project root.');
  }

  return candidates[0];
}

function stripMidiExtension(fileName) {
  return fileName.replace(/\.(mid|midi)$/i, '');
}

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleCaseToken(token) {
  if (/^[A-Z0-9-]+$/.test(token)) {
    return token;
  }

  if (/^\d+$/.test(token)) {
    return token;
  }

  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function normalizeTrainBaseName(baseName) {
  return baseName
    .replace(/_v\d+/i, '')
    .replace(/_alt$/i, '')
    .replace(/_OnlineSequencer_version$/i, '')
    .replace(/_many_stations$/i, '')
    .replace(/_famous$/i, '')
    .replace(/_platform$/i, '')
    .replace(/_Joban_Line$/i, '')
    .replace(/_by_[A-Za-z0-9-]+$/i, '')
    .trim();
}

function humanizeTrainName(baseName) {
  const cleaned = normalizeTrainBaseName(baseName)
    .replace(/platform(\d+)/gi, 'platform $1')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned
    .split(' ')
    .map(titleCaseToken)
    .join(' ');
}

function getTrainGroupKey(relativePath) {
  const baseName = stripMidiExtension(path.basename(relativePath));
  const sectionName = relativePath.split(path.sep)[1];

  return [sectionName, normalizeTrainBaseName(baseName)].join('/');
}

function getVersionNumber(baseName) {
  const versionMatch = baseName.match(/_v(\d+)/i);
  return versionMatch ? Number(versionMatch[1]) : 0;
}

function analyzeMidiFile(filePath) {
  const midi = new Midi(fs.readFileSync(filePath));
  const noteCount = midi.tracks.reduce((total, track) => total + track.notes.length, 0);

  return {
    duration: midi.duration,
    noteCount,
    trackCount: midi.tracks.length,
  };
}

function safeAnalyzeMidiFile(filePath) {
  try {
    return {
      ok: true,
      ...analyzeMidiFile(filePath),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function scoreTrainCandidate(candidate) {
  if (!candidate.analysis.ok) {
    return Number.NEGATIVE_INFINITY;
  }

  let score =
    candidate.analysis.noteCount +
    candidate.analysis.duration * 12 +
    candidate.analysis.trackCount * 2 +
    getVersionNumber(candidate.baseName) * 1.5;

  if (/_alt$/i.test(candidate.baseName)) {
    score -= 120;
  }

  if (/original/i.test(candidate.baseName)) {
    score -= 20;
  }

  if (/OnlineSequencer_version/i.test(candidate.baseName)) {
    score -= 2;
  }

  return score;
}

function walkMidiFiles(dirPath) {
  return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const nextPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      return walkMidiFiles(nextPath);
    }

    return /\.(mid|midi)$/i.test(entry.name) ? [nextPath] : [];
  });
}

function buildRootEntries(sourceRoot) {
  return ROOT_LIBRARY_ENTRIES.map((entryDefinition) => {
    const sourcePath = path.join(sourceRoot, entryDefinition.source);
    const analysis = analyzeMidiFile(sourcePath);
    const fileName = `${entryDefinition.slug}.mid`;

    return {
      categoryId: entryDefinition.categoryId,
      categoryLabel: CATEGORY_LABELS.get(entryDefinition.categoryId),
      durationLabel: formatDuration(analysis.duration),
      fileName,
      id: `${entryDefinition.categoryId}/${entryDefinition.slug}`,
      sourcePath,
      subtitle: entryDefinition.subtitle,
      title: entryDefinition.title,
      url: `/midi/${entryDefinition.categoryId}/${fileName}`,
    };
  });
}

function buildTrainEntries(sourceRoot) {
  const trainRoot = path.join(sourceRoot, 'Japanese Train Melodies');
  const groupedCandidates = new Map();

  for (const filePath of walkMidiFiles(trainRoot)) {
    const relativePath = path.relative(sourceRoot, filePath);
    const [, sectionName] = relativePath.split(path.sep);
    const sectionConfig = TRAIN_SECTION_CONFIG[sectionName];

    if (!sectionConfig) {
      continue;
    }

    const baseName = stripMidiExtension(path.basename(relativePath));
    const candidate = {
      analysis: safeAnalyzeMidiFile(filePath),
      baseName,
      relativePath,
      score: 0,
      sectionConfig,
      sourcePath: filePath,
    };

    candidate.score = scoreTrainCandidate(candidate);

    const groupKey = getTrainGroupKey(relativePath);

    if (EXCLUDED_TRAIN_GROUP_KEYS.has(groupKey)) {
      continue;
    }

    const existingGroup = groupedCandidates.get(groupKey) ?? [];
    existingGroup.push(candidate);
    groupedCandidates.set(groupKey, existingGroup);
  }

  const usedSlugs = new Set();
  const trainEntries = [];

  for (const [groupKey, candidates] of [...groupedCandidates.entries()].sort()) {
    const chosenCandidate = [...candidates].sort((left, right) => right.score - left.score)[0];

    if (!chosenCandidate?.analysis.ok) {
      throw new Error(
        `No valid MIDI file found for train group ${groupKey}. Last error: ${chosenCandidate?.analysis.error ?? 'unknown'}`,
      );
    }

    const title = humanizeTrainName(chosenCandidate.baseName);
    const baseSlug = slugify(title);
    let slug = baseSlug;
    let duplicateIndex = 2;

    while (usedSlugs.has(`${chosenCandidate.sectionConfig.categoryId}/${slug}`)) {
      slug = `${baseSlug}-${duplicateIndex}`;
      duplicateIndex += 1;
    }

    usedSlugs.add(`${chosenCandidate.sectionConfig.categoryId}/${slug}`);

    const fileName = `${slug}.mid`;

    trainEntries.push({
      categoryId: chosenCandidate.sectionConfig.categoryId,
      categoryLabel: CATEGORY_LABELS.get(chosenCandidate.sectionConfig.categoryId),
      durationLabel: formatDuration(chosenCandidate.analysis.duration),
      fileName,
      id: `${chosenCandidate.sectionConfig.categoryId}/${slug}`,
      sourcePath: chosenCandidate.sourcePath,
      subtitle: chosenCandidate.sectionConfig.subtitle,
      title,
      url: `/midi/${chosenCandidate.sectionConfig.categoryId}/${fileName}`,
    });
  }

  return trainEntries;
}

function sortEntries(left, right) {
  return left.title.localeCompare(right.title, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

async function emptyDir(dirPath) {
  await fsp.rm(dirPath, { force: true, recursive: true });
  await fsp.mkdir(dirPath, { recursive: true });
}

function renderLibraryFile(categories) {
  const serializedCategories = JSON.stringify(categories, null, 2);

  return `export interface MidiLibraryItem {
  categoryId: string;
  categoryLabel: string;
  durationLabel: string;
  fileName: string;
  id: string;
  subtitle: string;
  title: string;
  url: string;
}

export interface MidiLibraryCategory {
  id: string;
  label: string;
  items: MidiLibraryItem[];
}

export const MIDI_LIBRARY_CATEGORIES: MidiLibraryCategory[] = ${serializedCategories};

export const MIDI_LIBRARY: MidiLibraryItem[] = MIDI_LIBRARY_CATEGORIES.flatMap(
  (category) => category.items,
);
`;
}

async function writeCatalog(entries, libraryFilePath) {
  const categories = CATEGORY_DEFINITIONS.map((categoryDefinition) => ({
    id: categoryDefinition.id,
    items: entries
      .filter((entry) => entry.categoryId === categoryDefinition.id)
      .sort(sortEntries)
      .map(({ sourcePath, ...entry }) => entry),
    label: categoryDefinition.label,
  })).filter((category) => category.items.length > 0);

  await fsp.writeFile(libraryFilePath, renderLibraryFile(categories));
}

async function copyEntries(entries, outputRoot) {
  for (const entry of entries) {
    const targetPath = path.join(outputRoot, entry.categoryId, entry.fileName);
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await fsp.copyFile(entry.sourcePath, targetPath);
  }
}

async function main() {
  const sourceRoot = findSourceRoot();
  const sourceDirName = path.basename(sourceRoot);
  const setOutputRoot =
    sourceDirName === 'set'
      ? path.join(projectRoot, 'set-generated')
      : path.join(projectRoot, 'set');
  const publicMidiRoot = path.join(projectRoot, 'public', 'midi');
  const libraryFilePath = path.join(projectRoot, 'lib', 'library.ts');

  const entries = [...buildRootEntries(sourceRoot), ...buildTrainEntries(sourceRoot)];

  await emptyDir(setOutputRoot);
  await emptyDir(publicMidiRoot);

  await copyEntries(entries, setOutputRoot);
  await copyEntries(entries, publicMidiRoot);
  await writeCatalog(entries, libraryFilePath);

  console.log(`Source root: ${path.relative(projectRoot, sourceRoot)}`);
  console.log(`Set output: ${path.relative(projectRoot, setOutputRoot)}`);
  console.log(`Public output: ${path.relative(projectRoot, publicMidiRoot)}`);
  console.log(`Catalog entries: ${entries.length}`);
}

await main();
