/**
 * Generates purchase/search links for a track across music stores.
 * Deep-links to search results on each platform.
 */

export const STORES = [
  {
    key: "beatport",
    label: "Beatport",
    color: "#01FF95",
    buildUrl: (q) => `https://www.beatport.com/search?q=${q}`,
  },
  {
    key: "bandcamp",
    label: "Bandcamp",
    color: "#1DA0C3",
    buildUrl: (q) => `https://bandcamp.com/search?q=${q}`,
  },
  {
    key: "traxsource",
    label: "Traxsource",
    color: "#EF6C00",
    buildUrl: (q) => `https://www.traxsource.com/search?term=${q}`,
  },
  {
    key: "juno",
    label: "Juno",
    color: "#E53935",
    buildUrl: (q) => `https://www.junodownload.com/search/?q%5Ball%5D%5B%5D=${q}`,
  },
  {
    key: "qobuz",
    label: "Qobuz",
    color: "#2F78D7",
    buildUrl: (q) => `https://www.qobuz.com/us-en/search?q=${q}`,
  },
  {
    key: "apple",
    label: "Apple",
    color: "#FA243C",
    buildUrl: (q) => `https://music.apple.com/us/search?term=${q}`,
  },
];

export function getBuyLinks(track) {
  const artist = track.artists.map((a) => a.name).join(" ");
  const title = track.name;
  const query = encodeURIComponent(`${artist} ${title}`);

  return STORES.map((store) => ({
    ...store,
    url: store.buildUrl(query),
  }));
}

export function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Extract a Spotify playlist ID from various URL/URI formats.
 * Supports:
 *   https://open.spotify.com/playlist/XXXXX?si=...
 *   spotify:playlist:XXXXX
 *   XXXXX (bare ID)
 */
export function extractPlaylistId(input) {
  if (!input) return null;
  const trimmed = input.trim();

  // spotify:playlist:ID
  const uriMatch = trimmed.match(/spotify:playlist:([a-zA-Z0-9]+)/);
  if (uriMatch) return uriMatch[1];

  // URL format
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/");
    const idx = parts.indexOf("playlist");
    if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
  } catch {
    // not a URL
  }

  // Bare ID (alphanumeric, typically 22 chars)
  if (/^[a-zA-Z0-9]{15,}$/.test(trimmed)) return trimmed;

  return null;
}

/**
 * Convert Spotify's key (0-11) + mode (0=minor, 1=major) to Camelot notation.
 * Returns e.g. "8A", "11B", or null if data missing.
 */
const CAMELOT = {
  // [key, mode] => camelot
  "0,1": "8B",   // C major
  "1,1": "3B",   // C#/Db major
  "2,1": "10B",  // D major
  "3,1": "5B",   // D#/Eb major
  "4,1": "12B",  // E major
  "5,1": "7B",   // F major
  "6,1": "2B",   // F#/Gb major
  "7,1": "9B",   // G major
  "8,1": "4B",   // G#/Ab major
  "9,1": "11B",  // A major
  "10,1": "6B",  // A#/Bb major
  "11,1": "1B",  // B major
  "0,0": "5A",   // C minor
  "1,0": "12A",  // C#/Db minor
  "2,0": "7A",   // D minor
  "3,0": "2A",   // D#/Eb minor
  "4,0": "9A",   // E minor
  "5,0": "4A",   // F minor
  "6,0": "11A",  // F#/Gb minor
  "7,0": "6A",   // G minor
  "8,0": "1A",   // G#/Ab minor
  "9,0": "8A",   // A minor
  "10,0": "3A",  // A#/Bb minor
  "11,0": "10A", // B minor
};

const KEY_NAMES = {
  "0,1": "C maj", "1,1": "Db maj", "2,1": "D maj", "3,1": "Eb maj",
  "4,1": "E maj", "5,1": "F maj", "6,1": "F#maj", "7,1": "G maj",
  "8,1": "Ab maj", "9,1": "A maj", "10,1": "Bb maj", "11,1": "B maj",
  "0,0": "C min", "1,0": "Db min", "2,0": "D min", "3,0": "Eb min",
  "4,0": "E min", "5,0": "F min", "6,0": "F# min", "7,0": "G min",
  "8,0": "Ab min", "9,0": "A min", "10,0": "Bb min", "11,0": "B min",
};

export function getCamelotKey(key, mode) {
  if (key == null || mode == null || key < 0) return null;
  const k = `${key},${mode}`;
  return {
    camelot: CAMELOT[k] || null,
    musical: KEY_NAMES[k] || null,
  };
}

/**
 * Parse the numeric Camelot value for sorting (e.g. "8A" => 8, "11B" => 11)
 */
export function camelotSortVal(camelotStr) {
  if (!camelotStr) return 999;
  const num = parseInt(camelotStr, 10);
  const letter = camelotStr.endsWith("B") ? 1 : 0;
  return num * 2 + letter;
}
