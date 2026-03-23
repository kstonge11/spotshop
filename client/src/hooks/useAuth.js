import { useState, useEffect, useCallback } from "react";

export function useAuth() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const checkAuth = useCallback(async () => {
        try {
            const res = await fetch("/auth/me", { credentials: "include" });
            const data = await res.json();
            setUser(data.authenticated ? data.user : null);
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    const login = () => {
        window.location.href = "/auth/login";
    };

    const logout = async () => {
        await fetch("/auth/logout", { method: "POST", credentials: "include" });
        setUser(null);
    };

    return { user, loading, login, logout };
}