import { spotifyFetch } from "@/lib/spotify";

async function probe(label: string, path: string) {
  try {
    const data = await spotifyFetch<unknown>(path);
    return { label, path, ok: true, sample: JSON.stringify(data).slice(0, 200) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { label, path, ok: false, error: msg };
  }
}

export default async function DebugPage() {
  const results = await Promise.all([
    probe("Profile", "/me"),
    probe("My playlists (first page)", "/me/playlists?limit=5"),
    probe("Liked songs (first 5)", "/me/tracks?limit=5"),
    probe("Top artists", "/me/top/artists?limit=5"),
    probe("Recently played", "/me/player/recently-played?limit=5"),
    probe("Playlist meta (ORDENAR)", "/playlists/3A2QgeFb2DTynA42GNuhMf"),
    probe("Playlist items NEW (ORDENAR)", "/playlists/3A2QgeFb2DTynA42GNuhMf/items?limit=5"),
    probe("Playlist tracks OLD (ORDENAR)", "/playlists/3A2QgeFb2DTynA42GNuhMf/tracks?limit=5"),
  ]);

  return (
    <main className="min-h-screen p-8">
      <h1 className="display-italic text-5xl mb-8">Diagnóstico Spotify API</h1>
      <ul className="space-y-4">
        {results.map((r) => (
          <li
            key={r.path}
            className="hairline-b pb-4 grid grid-cols-[180px_1fr_60px] gap-4 items-start"
          >
            <span className="font-mono text-sm text-cream">{r.label}</span>
            <span className="font-mono text-xs text-mute break-all">
              {r.path}
              {r.ok ? (
                <span className="block text-cream-dim mt-1">
                  {(r as { sample: string }).sample}…
                </span>
              ) : (
                <span className="block text-blood mt-1">
                  {(r as { error: string }).error}
                </span>
              )}
            </span>
            <span
              className={`label-mono text-right ${
                r.ok ? "text-acid" : "text-blood"
              }`}
            >
              {r.ok ? "200 ✓" : "ERR"}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
