import NextAuth from "next-auth";
import Spotify from "next-auth/providers/spotify";

// Auth.js v5 + Next.js sometimes computes the callback origin as `localhost`
// during the token exchange even when the request came in via 127.0.0.1.
// Spotify rejects new apps with localhost redirect URIs, so we patch the
// outgoing token request body to use 127.0.0.1 — matching what was sent in
// the authorize step and what's registered in the Spotify dashboard.
const _origFetch = globalThis.fetch;
globalThis.fetch = async function (input: any, init?: any) {
  const url = typeof input === "string" ? input : input.url;
  if (url?.includes("accounts.spotify.com/api/token") && init?.body) {
    let body = init.body.toString();
    if (body.includes("localhost")) {
      body = body.replaceAll("localhost", "127.0.0.1");
      init = { ...init, body };
    }
  }
  return _origFetch(input, init);
};

const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-library-read",
  "user-library-modify",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-top-read",
  "user-read-recently-played",
  "user-follow-read",
  "user-follow-modify",
  "ugc-image-upload",
].join(" ");

async function refreshSpotifyToken(refreshToken: string) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
        ).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error("Failed to refresh Spotify token");
  return (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Spotify({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      checks: ["state"],
      authorization: {
        url: "https://accounts.spotify.com/authorize",
        params: { scope: SPOTIFY_SCOPES },
      },
      token: "https://accounts.spotify.com/api/token",
      userinfo: "https://api.spotify.com/v1/me",
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = (account.expires_at ?? 0) * 1000;
        return token;
      }

      if (Date.now() < (token.expiresAt as number) - 60_000) {
        return token;
      }

      try {
        const refreshed = await refreshSpotifyToken(
          token.refreshToken as string,
        );
        token.accessToken = refreshed.access_token;
        token.expiresAt = Date.now() + refreshed.expires_in * 1000;
        if (refreshed.refresh_token) token.refreshToken = refreshed.refresh_token;
        return token;
      } catch (e) {
        console.error("Token refresh failed", e);
        return { ...token, error: "RefreshTokenError" };
      }
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.error = token.error as string | undefined;
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: string;
  }
}
