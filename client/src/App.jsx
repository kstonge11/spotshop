import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import Playlists from "./pages/Playlists";
import PlaylistTracks from "./pages/PlaylistTracks";
import "./index.css";

export default function App() {
    const { user, loading, login, logout } = useAuth();

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="spinner" />
            </div>
        );
    }

    if (!user) {
        return <Login onLogin={login} />;
    }

    return (
        <BrowserRouter>
            <div className="app">
                <header className="app-header">
                    <div className="header-inner">
                        <span className="logo">🎵 Spotshop</span>
                        <div className="user-info">
                            {user.images?.[0] && (
                                <img src={user.images[0].url} alt={user.display_name} className="avatar" />
                            )}
                            <span>{user.display_name}</span>
                            <button onClick={logout} className="btn-ghost">Log out</button>
                        </div>
                    </div>
                </header>
                <main className="main-content">
                    <Routes>
                        <Route path="/" element={<Playlists />} />
                        <Route path="/playlist/:id" element={<PlaylistTracks />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    );
}