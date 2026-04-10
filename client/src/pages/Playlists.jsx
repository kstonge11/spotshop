import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { extractPlaylistId } from "../utils/buyLinks";

export default function Playlists() {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchPlaylists() {
      try {
        const res = await fetch("/api/playlists?limit=50", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch playlists");
        const data = await res.json();
        setPlaylists(data.items.filter(Boolean));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchPlaylists();
  }, []);

  const handleLinkGo = (e) => {
    e.preventDefault();
    const id = extractPlaylistId(linkInput);
    if (id) {
      setLinkError(null);
      navigate(`/playlist/${id}`);
    } else {
      setLinkError("Couldn't parse that link — paste a Spotify playlist URL");
    }
  };

  if (loading) return <div className="status-msg">Loading playlists…</div>;
  if (error) return <div className="status-msg error">{error}</div>;

  return (
    <div className="page">
      <div className="link-input-section">
        <h2 className="page-title">Open a Playlist</h2>
        <form className="link-input-row" onSubmit={handleLinkGo}>
          <input
            type="text"
            className="link-input"
            placeholder="Paste a Spotify playlist link or URI…"
            value={linkInput}
            onChange={(e) => {
              setLinkInput(e.target.value);
              setLinkError(null);
            }}
          />
          <button type="submit" className="btn-go" disabled={!linkInput.trim()}>
            Go →
          </button>
        </form>
        {linkError && <p className="link-error">{linkError}</p>}
      </div>

      <div className="section-divider">
        <span>or browse your library</span>
      </div>

      <div className="playlist-grid">
        {playlists.map((playlist) => (
          <button
            key={playlist.id}
            className="playlist-card"
            onClick={() => navigate(`/playlist/${playlist.id}`)}
          >
            <div
              className={`playlist-img-wrap${
                !playlist.images?.[0] ? " placeholder" : ""
              }`}
            >
              {playlist.images?.[0] && (
                <img src={playlist.images[0].url} alt={playlist.name} />
              )}
            </div>
            <div className="playlist-info">
              <span className="playlist-name">{playlist.name}</span>
              <span className="playlist-meta">
                {playlist.tracks.total} tracks
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
