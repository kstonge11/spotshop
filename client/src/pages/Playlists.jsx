import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Playlists() {
    const [playlists, setPlaylists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        async function fetchPlaylists() {
            try {
                const res = await fetch("/api/playlists?limit=50", { credentials: "include" });
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

    if (loading) return <div className="status-msg">Loading playlists...</div>;
    if (error) return <div className="status-msg error">{error}</div>;

    return (
        <div className="page">
            <h2 className="page-title">Your Playlists</h2>
            <div className="playlist-grid">
                {playlists.map((playlist) => (
                    <button
                        key={playlist.id}
                        className="playlist-card"
                        onClick={() => navigate(`/playlist/${playlist.id}`)}
                    >
                        <div className={`playlist-img-wrap${!playlist.images?.[0] ? " placeholder" : ""}`}>
                            {playlist.images?.[0] && (
                                <img src={playlist.images[0].url} alt={playlist.name} />
                            )}
                        </div>
                        <div className="playlist-info">
                            <span className="playlist-name">{playlist.name}</span>
                            <span className="playlist-meta">{playlist.tracks.total} tracks</span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
