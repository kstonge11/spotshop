import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getBuyLinks, formatDuration } from "../utils/buyLinks";

export default function PlaylistTracks() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedTrack, setExpandedTrack] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [playlistRes, tracksRes] = await Promise.all([
          fetch(`/api/playlists/${id}`, { credentials: "include" }),
          fetch(`/api/playlists/${id}/tracks?limit=50`, {
            credentials: "include",
          }),
        ]);

        if (!playlistRes.ok || !tracksRes.ok)
          throw new Error("Failed to fetch data");

        const [playlistData, tracksData] = await Promise.all([
          playlistRes.json(),
          tracksRes.json(),
        ]);

        setPlaylist(playlistData);
        // Filter out null tracks (Spotify quirk with local files etc.)
        setTracks(tracksData.items.filter((item) => item?.track));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  if (loading) return <div className="status-msg">Loading tracks...</div>;
  if (error) return <div className="status-msg error">{error}</div>;

  return (
    <div className="page">
      <button onClick={() => navigate("/")} className="btn-back">
        ← Back to Playlists
      </button>

      <div className="playlist-header">
        {playlist?.images?.[0] && (
          <img
            src={playlist.images[0].url}
            alt={playlist.name}
            className="playlist-header-img"
          />
        )}
        <div>
          <h2>{playlist?.name}</h2>
          {playlist?.description && (
            <p className="playlist-description"
              dangerouslySetInnerHTML={{ __html: playlist.description }}
            />
          )}
          <p className="playlist-meta">
            by {playlist?.owner?.display_name} · {playlist?.tracks?.total} tracks
          </p>
        </div>
      </div>

      <div className="track-list">
        {tracks.map(({ track }, index) => {
          const isExpanded = expandedTrack === track.id;
          const buyLinks = getBuyLinks(track);

          return (
            <div
              key={`${track.id}-${index}`}
              className={`track-row ${isExpanded ? "expanded" : ""}`}
            >
              <div
                className="track-main"
                onClick={() =>
                  setExpandedTrack(isExpanded ? null : track.id)
                }
              >
                <span className="track-num">{index + 1}</span>
                {track.album?.images?.[1] && (
                  <img
                    src={track.album.images[1].url}
                    alt={track.album.name}
                    className="track-thumb"
                  />
                )}
                <div className="track-info">
                  <span className="track-name">{track.name}</span>
                  <span className="track-artist">
                    {track.artists.map((a) => a.name).join(", ")}
                  </span>
                </div>
                <span className="track-album">{track.album?.name}</span>
                <span className="track-duration">
                  {formatDuration(track.duration_ms)}
                </span>
                <span className="track-expand-hint">
                  {isExpanded ? "▲" : "▼"}
                </span>
              </div>

              {isExpanded && (
                <div className="buy-links">
                  <span className="buy-links-label">Buy on:</span>
                  {buyLinks.map(({ store, url, color, icon }) => (
                    <a
                      key={store}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="buy-link"
                      style={{ "--store-color": color }}
                    >
                      {icon} {store}
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
