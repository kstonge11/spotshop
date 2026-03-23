/**
 * Generates purchase/search links for a track across music stores.
 * None of these stores have open "buy" APIs, so we deep-link to search results.
 */

export function getBuyLinks(track) {
  const artist = track.artists.map((a) => a.name).join(" ");
  const title = track.name;
  const query = encodeURIComponent(`${artist} ${title}`);
  const artistQuery = encodeURIComponent(artist);
  const titleQuery = encodeURIComponent(title);

  return [
    {
      store: "Beatport",
      url: `https://www.beatport.com/search?q=${query}`,
      color: "#01FF95",
      icon: "🎧",
    },
    {
      store: "Bandcamp",
      url: `https://bandcamp.com/search?q=${query}`,
      color: "#1DA0C3",
      icon: "🎸",
    },
    {
      store: "Apple Music",
      url: `https://music.apple.com/us/search?term=${query}`,
      color: "#FA243C",
      icon: "🍎",
    },
    {
      store: "Qobuz",
      url: `https://www.qobuz.com/us-en/search?q=${query}`,
      color: "#2F78D7",
      icon: "🎵",
    },
  ];
}

export function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
