import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getBuyLinks,
  formatDuration,
  getCamelotKey,
  camelotSortVal,
} from "../utils/buyLinks";

const SORT_OPTIONS = [
  { value: "default", label: "Track #" },
  { value: "bpm-asc", label: "BPM ↑" },
  { value: "bpm-desc", label: "BPM ↓" },
  { value: "key", label: "Key (Camelot)" },
  { value: "energy-desc", label: "Energy ↓" },
  { value: "energy-asc", label: "Energy ↑" },
  { value: "dance-desc", label: "Danceable ↓" },
  { value: "dance-asc", label: "Danceable ↑" },
  { value: "duration-asc", label: "Duration ↑" },
  { value: "duration-desc", label: "Duration ↓" },
];

export default function PlaylistTracks() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [features, setFeatures] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingFeatures, setLoadingFeatures] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);

  // Search, sort, filter
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("default");
  const [keyFilter, setKeyFilter] = useState("");
  const [bpmMin, setBpmMin] = useState("");
  const [bpmMax, setBpmMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Audio preview
  const [playingId, setPlayingId] = useState(null);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef(null);
  const rafRef = useRef(null);

  // Spotify embed
  const [embedTrackId, setEmbedTrackId] = useState(null);

  // ── Data fetching ───────────────────────────────────────────────

  const fetchTracks = useCallback(
    async (offset = 0) => {
      const res = await fetch(
        `/api/playlists/${id}/tracks?limit=50&offset=${offset}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch tracks");
      return res.json();
    },
    [id]
  );

  const fetchAudioFeatures = useCallback(async (trackIds) => {
    if (!trackIds.length) return;
    setLoadingFeatures(true);
    try {
      // Fetch in batches of 10 so tags appear progressively
      for (let i = 0; i < trackIds.length; i += 10) {
        const batch = trackIds.slice(i, i + 10);
        try {
          const res = await fetch(
            `/api/audio-features?ids=${batch.join(",")}`,
            { credentials: "include" }
          );
          if (!res.ok) continue;
          const data = await res.json();
          const map = {};
          (data.audio_features || []).forEach((f) => {
            if (f) map[f.id] = f;
          });
          setFeatures((prev) => ({ ...prev, ...map }));
        } catch {
          // continue with remaining batches
        }
      }
    } finally {
      setLoadingFeatures(false);
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const [playlistRes, tracksData] = await Promise.all([
          fetch(`/api/playlists/${id}`, { credentials: "include" }),
          fetchTracks(0),
        ]);

        if (!playlistRes.ok) throw new Error("Failed to fetch playlist");

        const playlistData = await playlistRes.json();
        setPlaylist(playlistData);

        const items = (tracksData.items || []).filter((item) => item?.track);
        setTracks(items);
        setHasMore(!!tracksData.next);

        // Fetch audio features for first batch
        const ids = items.map((i) => i.track.id).filter(Boolean);
        fetchAudioFeatures(ids);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id, fetchTracks, fetchAudioFeatures]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await fetchTracks(tracks.length);
      const newItems = (data.items || []).filter((item) => item?.track);
      setTracks((prev) => [...prev, ...newItems]);
      setHasMore(!!data.next);

      const ids = newItems.map((i) => i.track.id).filter(Boolean);
      fetchAudioFeatures(ids);
    } catch {
      // retry available
    } finally {
      setLoadingMore(false);
    }
  };

  // ── Search / sort / filter ──────────────────────────────────────

  const availableKeys = useMemo(() => {
    const keys = new Set();
    Object.values(features).forEach((f) => {
      const k = getCamelotKey(f.key, f.mode);
      if (k?.camelot) keys.add(k.camelot);
    });
    return [...keys].sort((a, b) => camelotSortVal(a) - camelotSortVal(b));
  }, [features]);

  const processedTracks = useMemo(() => {
    const lowerSearch = search.toLowerCase().trim();

    // Attach original index for "default" sort
    let list = tracks.map((item, i) => ({ ...item, _idx: i }));

    // Search filter
    if (lowerSearch) {
      list = list.filter(({ track }) => {
        const name = track.name?.toLowerCase() || "";
        const artists =
          track.artists?.map((a) => a.name.toLowerCase()).join(" ") || "";
        const album = track.album?.name?.toLowerCase() || "";
        return (
          name.includes(lowerSearch) ||
          artists.includes(lowerSearch) ||
          album.includes(lowerSearch)
        );
      });
    }

    // Key filter
    if (keyFilter) {
      list = list.filter(({ track }) => {
        const f = features[track.id];
        if (!f) return false;
        const k = getCamelotKey(f.key, f.mode);
        return k?.camelot === keyFilter;
      });
    }

    // BPM range filter
    const minBpm = bpmMin ? parseFloat(bpmMin) : null;
    const maxBpm = bpmMax ? parseFloat(bpmMax) : null;
    if (minBpm != null || maxBpm != null) {
      list = list.filter(({ track }) => {
        const f = features[track.id];
        if (!f) return false;
        const bpm = Math.round(f.tempo);
        if (minBpm != null && bpm < minBpm) return false;
        if (maxBpm != null && bpm > maxBpm) return false;
        return true;
      });
    }

    // Sort
    if (sortBy !== "default") {
      list.sort((a, b) => {
        const fa = features[a.track.id];
        const fb = features[b.track.id];
        if (!fa && !fb) return 0;
        if (!fa) return 1;
        if (!fb) return -1;

        switch (sortBy) {
          case "bpm-asc":
            return fa.tempo - fb.tempo;
          case "bpm-desc":
            return fb.tempo - fa.tempo;
          case "key":
            return (
              camelotSortVal(getCamelotKey(fa.key, fa.mode)?.camelot) -
              camelotSortVal(getCamelotKey(fb.key, fb.mode)?.camelot)
            );
          case "energy-desc":
            return fb.energy - fa.energy;
          case "energy-asc":
            return fa.energy - fb.energy;
          case "dance-desc":
            return fb.danceability - fa.danceability;
          case "dance-asc":
            return fa.danceability - fb.danceability;
          case "duration-asc":
            return a.track.duration_ms - b.track.duration_ms;
          case "duration-desc":
            return b.track.duration_ms - a.track.duration_ms;
          default:
            return 0;
        }
      });
    }

    return list;
  }, [tracks, features, search, sortBy, keyFilter, bpmMin, bpmMax]);

  // ── Audio preview ───────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const updateProgress = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      const pct =
        (audioRef.current.currentTime / audioRef.current.duration) * 100 || 0;
      setProgress(pct);
      rafRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  const togglePreview = useCallback(
    (trackId, previewUrl) => {
      setEmbedTrackId(null);
      if (playingId === trackId) {
        audioRef.current?.pause();
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        setPlayingId(null);
        setProgress(0);
        return;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      }
      const audio = new Audio(previewUrl);
      audio.volume = 0.5;
      audioRef.current = audio;
      audio.addEventListener("ended", () => {
        setPlayingId(null);
        setProgress(0);
      });
      audio
        .play()
        .then(() => {
          setPlayingId(trackId);
          setProgress(0);
          rafRef.current = requestAnimationFrame(updateProgress);
        })
        .catch(() => setPlayingId(null));
    },
    [playingId, updateProgress]
  );

  const toggleEmbed = useCallback(
    (trackId) => {
      if (audioRef.current) {
        audioRef.current.pause();
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        setPlayingId(null);
        setProgress(0);
      }
      setEmbedTrackId(embedTrackId === trackId ? null : trackId);
    },
    [embedTrackId]
  );

  // ── Render ──────────────────────────────────────────────────────

  if (loading) return <div className="status-msg">Loading tracks…</div>;
  if (error) return <div className="status-msg error">{error}</div>;

  const hasFeatures = Object.keys(features).length > 0;

  return (
    <div className="page">
      <button onClick={() => navigate("/")} className="btn-back">
        ← Back
      </button>

      <div className="playlist-hero">
        {playlist?.images?.[0] && (
          <img
            src={playlist.images[0].url}
            alt={playlist.name}
            className="playlist-hero-img"
          />
        )}
        <div className="playlist-hero-info">
          <h2 className="playlist-hero-title">{playlist?.name}</h2>
          {playlist?.description && (
            <p
              className="playlist-hero-desc"
              dangerouslySetInnerHTML={{ __html: playlist.description }}
            />
          )}
          <p className="playlist-hero-meta">
            {playlist?.owner?.display_name} · {playlist?.tracks?.total} tracks
            {loadingFeatures && " · analyzing…"}
          </p>
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="toolbar">
        <div className="toolbar-row">
          <input
            type="text"
            className="search-input"
            placeholder="Search tracks, artists, albums…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            className={`btn-filter-toggle${showFilters ? " active" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filters{keyFilter || bpmMin || bpmMax ? " ●" : ""}
          </button>
        </div>

        {showFilters && (
          <div className="toolbar-filters">
            <div className="filter-group">
              <label className="filter-label">Key</label>
              <select
                className="filter-select"
                value={keyFilter}
                onChange={(e) => setKeyFilter(e.target.value)}
              >
                <option value="">All keys</option>
                {availableKeys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label className="filter-label">BPM range</label>
              <div className="bpm-range">
                <input
                  type="number"
                  className="bpm-input"
                  placeholder="Min"
                  value={bpmMin}
                  onChange={(e) => setBpmMin(e.target.value)}
                />
                <span className="bpm-dash">–</span>
                <input
                  type="number"
                  className="bpm-input"
                  placeholder="Max"
                  value={bpmMax}
                  onChange={(e) => setBpmMax(e.target.value)}
                />
              </div>
            </div>
            {(keyFilter || bpmMin || bpmMax) && (
              <button
                className="btn-clear-filters"
                onClick={() => {
                  setKeyFilter("");
                  setBpmMin("");
                  setBpmMax("");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {(search || keyFilter || bpmMin || bpmMax) && (
          <div className="toolbar-status">
            Showing {processedTracks.length} of {tracks.length} tracks
          </div>
        )}
      </div>

      {/* ── Track List ───────────────────────────────────────────── */}
      <div className="tracks">
        {processedTracks.map(({ track, _idx }) => {
          const buyLinks = getBuyLinks(track);
          const albumImg =
            track.album?.images?.[1]?.url || track.album?.images?.[0]?.url;
          const isPlaying = playingId === track.id;
          const hasPreview = !!track.preview_url;
          const showEmbed = embedTrackId === track.id;
          const feat = features[track.id];
          const keyInfo = feat ? getCamelotKey(feat.key, feat.mode) : null;

          return (
            <div
              key={`${track.id}-${_idx}`}
              className={`track${isPlaying ? " track--playing" : ""}`}
            >
              <span className="track-num">{_idx + 1}</span>

              <div className="track-art-wrap">
                {albumImg ? (
                  <img src={albumImg} alt="" className="track-art" />
                ) : (
                  <div className="track-art track-art--empty">♪</div>
                )}
                <button
                  className={`preview-btn${isPlaying ? " preview-btn--playing" : ""}${showEmbed ? " preview-btn--embed" : ""}`}
                  onClick={() =>
                    hasPreview
                      ? togglePreview(track.id, track.preview_url)
                      : toggleEmbed(track.id)
                  }
                  title={
                    hasPreview
                      ? isPlaying
                        ? "Stop preview"
                        : "Play 30s preview"
                      : showEmbed
                        ? "Close player"
                        : "Open Spotify player"
                  }
                >
                  {isPlaying ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                  ) : showEmbed ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" fill="none" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5.14v13.72a1 1 0 001.5.86l11.04-6.86a1 1 0 000-1.72L9.5 4.28a1 1 0 00-1.5.86z" />
                    </svg>
                  )}
                </button>
                {isPlaying && (
                  <div className="preview-progress" style={{ "--pct": `${progress}%` }} />
                )}
              </div>

              <div className="track-meta">
                <span className="track-title">{track.name}</span>
                <span className="track-artist">
                  {track.artists.map((a) => a.name).join(", ")}
                </span>
              </div>

              {/* ── Audio Features Tags ──────────────────────────── */}
              {feat ? (
                <div className="track-tags">
                  <span className="tag tag--bpm" title="BPM">
                    {Math.round(feat.tempo)}
                  </span>
                  {keyInfo && (
                    <span className="tag tag--key" title={keyInfo.musical}>
                      {keyInfo.camelot}
                    </span>
                  )}
                  <span className="tag tag--energy" title={`Energy: ${Math.round(feat.energy * 100)}%`}>
                    <TagBar value={feat.energy} color="var(--green)" />
                    E
                  </span>
                  <span className="tag tag--dance" title={`Danceability: ${Math.round(feat.danceability * 100)}%`}>
                    <TagBar value={feat.danceability} color="#a855f7" />
                    D
                  </span>
                </div>
              ) : hasFeatures ? (
                <div className="track-tags">
                  <span className="tag tag--loading">…</span>
                </div>
              ) : null}

              <span className="track-dur">
                {formatDuration(track.duration_ms)}
              </span>

              <div className="track-buy">
                {buyLinks.map(({ key, label, url, color }) => (
                  <a
                    key={key}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="buy-pill"
                    style={{ "--sc": color }}
                    title={`Search on ${label}`}
                  >
                    {label}
                  </a>
                ))}
              </div>

              {showEmbed && (
                <div className="track-embed">
                  <iframe
                    src={`https://open.spotify.com/embed/track/${track.id}?theme=0`}
                    width="100%"
                    height="80"
                    frameBorder="0"
                    allow="encrypted-media"
                    loading="lazy"
                    title={`Preview ${track.name}`}
                  />
                </div>
              )}
            </div>
          );
        })}

        {processedTracks.length === 0 && (
          <div className="status-msg">No tracks match your filters</div>
        )}
      </div>

      {hasMore && (
        <div className="load-more-wrap">
          <button
            className="btn-load-more"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading…" : "Load more tracks"}
          </button>
          <span className="load-more-count">
            Showing {tracks.length} of {playlist?.tracks?.total}
          </span>
        </div>
      )}
    </div>
  );
}

/** Tiny inline bar chart for energy/danceability */
function TagBar({ value, color }) {
  return (
    <span className="tag-bar" style={{ "--bar-pct": `${value * 100}%`, "--bar-color": color }}>
      <span className="tag-bar-fill" />
    </span>
  );
}
