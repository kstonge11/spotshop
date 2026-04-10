require("dotenv").config();

console.log("CLIENT_ID loaded:", !!process.env.SPOTIFY_CLIENT_ID);
console.log("REDIRECT_URI:", process.env.REDIRECT_URI);


const express = require("express");
const cors = require("cors");
const session = require("express-session");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://127.0.0.1:5173",
    credentials: true,
  })
);
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60, // 1 hour
    },
  })
);

// ── Spotify Config ────────────────────────────────────────────────────────────
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI =
  process.env.REDIRECT_URI || "http://127.0.0.1:3001/auth/callback";

const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-read-private",
].join(" ");

// ── Auth Routes ───────────────────────────────────────────────────────────────

// Step 1: Redirect user to Spotify login
app.get("/auth/login", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauth_state = state;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope: SPOTIFY_SCOPES,
    redirect_uri: REDIRECT_URI,
    state,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

// Step 2: Spotify redirects back here with a code
app.get("/auth/callback", async (req, res) => {
  const { code, error, state } = req.query;
  const clientUrl = process.env.CLIENT_URL || "http://127.0.0.1:5173";

  if (error) {
    return res.redirect(`${clientUrl}?error=${encodeURIComponent(error)}`);
  }

  if (!state || state !== req.session.oauth_state) {
    return res.redirect(`${clientUrl}?error=state_mismatch`);
  }
  delete req.session.oauth_state;

  try {
    const tokenResponse = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
          ).toString("base64")}`,
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    req.session.access_token = access_token;
    req.session.refresh_token = refresh_token;
    req.session.token_expires_at = Date.now() + expires_in * 1000;

    res.redirect(clientUrl);
  } catch (err) {
    console.error("Token exchange failed:", err.response?.data || err.message);
    res.redirect(`${clientUrl}?error=token_exchange_failed`);
  }
});

// Step 3: Check if user is logged in
app.get("/auth/me", async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ authenticated: false });
  }

  try {
    await refreshTokenIfNeeded(req);
    const profile = await spotifyGet("/me", req.session.access_token);
    res.json({ authenticated: true, user: profile });
  } catch (err) {
    console.error("/auth/me failed:", err.response?.data || err.message);
    res.status(401).json({ authenticated: false });
  }
});

// Logout
app.post("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("Session destroy error:", err);
    res.json({ success: true });
  });
});

// ── Spotify API Proxy Routes ──────────────────────────────────────────────────

app.get("/api/playlists", requireAuth, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const data = await spotifyGet(
      `/me/playlists?limit=${limit}&offset=${offset}`,
      req.session.access_token
    );
    res.json(data);
  } catch (err) {
    handleSpotifyError(err, res);
  }
});

app.get("/api/playlists/:id/tracks", requireAuth, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const data = await spotifyGet(
      `/playlists/${req.params.id}/tracks?limit=${limit}&offset=${offset}&fields=items(track(id,name,artists,album(name,images),external_urls,duration_ms,preview_url)),next,total`,
      req.session.access_token
    );
    res.json(data);
  } catch (err) {
    handleSpotifyError(err, res);
  }
});

app.get("/api/playlists/:id", requireAuth, async (req, res) => {
  try {
    const data = await spotifyGet(
      `/playlists/${req.params.id}?fields=id,name,description,images,tracks(total),owner(display_name)`,
      req.session.access_token
    );
    res.json(data);
  } catch (err) {
    handleSpotifyError(err, res);
  }
});

// Batch audio features — tries Spotify first, falls back to RapidAPI
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = "spotify-extended-audio-features-api.p.rapidapi.com";

async function fetchAudioFeaturesFromRapidAPI(ids) {
  // RapidAPI endpoint only allows 5 IDs per request
  const chunks = [];
  for (let i = 0; i < ids.length; i += 5) {
    chunks.push(ids.slice(i, i + 5));
  }
  const allFeatures = [];
  for (const chunk of chunks) {
    try {
      const resp = await axios.get(
        `https://${RAPIDAPI_HOST}/v1/audio-features?ids=${chunk.join(",")}`,
        {
          headers: {
            "x-rapidapi-key": RAPIDAPI_KEY,
            "x-rapidapi-host": RAPIDAPI_HOST,
          },
        }
      );
      allFeatures.push(...(resp.data.audio_features || []));
    } catch (err) {
      if (err.response?.status === 429) {
        // Wait and retry once
        await new Promise((r) => setTimeout(r, 1200));
        const retry = await axios.get(
          `https://${RAPIDAPI_HOST}/v1/audio-features?ids=${chunk.join(",")}`,
          {
            headers: {
              "x-rapidapi-key": RAPIDAPI_KEY,
              "x-rapidapi-host": RAPIDAPI_HOST,
            },
          }
        );
        allFeatures.push(...(retry.data.audio_features || []));
      } else {
        throw err;
      }
    }
    // Small delay between requests to stay under rate limit
    await new Promise((r) => setTimeout(r, 300));
  }
  return { audio_features: allFeatures };
}

app.get("/api/audio-features", requireAuth, async (req, res) => {
  try {
    const { ids } = req.query;
    if (!ids) return res.json({ audio_features: [] });

    const allIds = ids.split(",").filter(Boolean);
    const chunks = [];
    for (let i = 0; i < allIds.length; i += 100) {
      chunks.push(allIds.slice(i, i + 100));
    }

    let audio_features = [];

    // Try Spotify first
    try {
      const results = await Promise.all(
        chunks.map((chunk) =>
          spotifyGet(
            `/audio-features?ids=${chunk.join(",")}`,
            req.session.access_token
          )
        )
      );
      audio_features = results.flatMap((r) => r.audio_features || []);
    } catch (spotifyErr) {
      const status = spotifyErr.response?.status;
      // If 403 (restricted), fall back to RapidAPI
      if (status === 403 && RAPIDAPI_KEY) {
        console.log("Spotify audio-features returned 403, falling back to RapidAPI...");
        try {
          const results = await Promise.all(
            chunks.map((chunk) => fetchAudioFeaturesFromRapidAPI(chunk))
          );
          audio_features = results.flatMap((r) => r.audio_features || []);
        } catch (rapidErr) {
          console.error("RapidAPI fallback failed:", rapidErr.response?.data || rapidErr.message);
          throw rapidErr;
        }
      } else if (status === 403 && !RAPIDAPI_KEY) {
        console.log("Spotify audio-features returned 403 and no RAPIDAPI_KEY configured.");
        return res.json({ audio_features: [], error: "audio_features_restricted" });
      } else {
        throw spotifyErr;
      }
    }

    res.json({ audio_features });
  } catch (err) {
    handleSpotifyError(err, res);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function spotifyGet(path, token) {
  const response = await axios.get(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

async function refreshTokenIfNeeded(req) {
  if (Date.now() < req.session.token_expires_at - 5 * 60 * 1000) return;

  const response = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: req.session.refresh_token,
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
        ).toString("base64")}`,
      },
    }
  );

  req.session.access_token = response.data.access_token;
  req.session.token_expires_at = Date.now() + response.data.expires_in * 1000;
  if (response.data.refresh_token) {
    req.session.refresh_token = response.data.refresh_token;
  }
}

function requireAuth(req, res, next) {
  if (!req.session.access_token) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  refreshTokenIfNeeded(req)
    .then(() => next())
    .catch(() => res.status(401).json({ error: "Token refresh failed" }));
}

function handleSpotifyError(err, res) {
  console.error("Spotify API error:", err.response?.data || err.message);
  const status = err.response?.status || 500;
  res.status(status).json({
    error: err.response?.data?.error || "Spotify API error",
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
});
