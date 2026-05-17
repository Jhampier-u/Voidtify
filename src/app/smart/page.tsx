import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMe } from "@/lib/spotify";
import { listSmartPlaylists } from "@/lib/smart-actions";
import { listTags } from "@/lib/tag-actions";
import TopBar from "@/components/TopBar";
import SmartPlaylistsManager from "@/components/SmartPlaylistsManager";

export default async function SmartPage() {
  const session = await auth();
  if (!session) redirect("/");

  const [me, smart, tags] = await Promise.all([
    getMe(),
    listSmartPlaylists(),
    listTags(),
  ]);

  return (
    <main className="min-h-screen flex flex-col">
      <TopBar me={me} active="smart" />

      <Header total={smart.length} />

      <SmartPlaylistsManager initial={smart} tags={tags} />

      <footer className="hairline-b mt-auto" />
      <div className="px-8 py-5 flex items-center justify-between label-mono text-mute">
        <span>VOLUMEN 06 · SMART</span>
        <span>{smart.length} REGLAS GUARDADAS</span>
      </div>
    </main>
  );
}

function Header({ total }: { total: number }) {
  return (
    <section className="px-8 py-16 lg:py-20 hairline-b">
      <div className="grid grid-cols-12 gap-6 items-end">
        <div className="col-span-12 lg:col-span-8 fade-in">
          <p className="label-mono text-acid mb-6">
            Volumen 06 — Reglas vivas
          </p>
          <h1 className="display-italic text-[clamp(3.5rem,10vw,10rem)] leading-[0.9]">
            Smart
            <br />
            <span className="display not-italic text-cream-dim">playlists.</span>
          </h1>
          <p className="font-serif italic text-lg text-cream-dim mt-8 max-w-md">
            Reglas que se evalúan sobre tu biblioteca cacheada. Cuando
            materializas, la playlist real en Spotify se actualiza con el
            resultado actual.
          </p>
        </div>

        <div className="col-span-12 lg:col-span-4 flex flex-col items-end justify-end fade-in">
          <p className="label-mono text-mute mb-2">Reglas</p>
          <p
            className="display num-tabular text-[clamp(5rem,16vw,13rem)] text-acid leading-none"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 1' }}
          >
            {total.toString().padStart(2, "0")}
          </p>
        </div>
      </div>
    </section>
  );
}
