import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMe, getLikedSongs } from "@/lib/spotify";
import TopBar from "@/components/TopBar";
import StatsScanner from "@/components/StatsScanner";

export default async function StatsPage() {
  const session = await auth();
  if (!session) redirect("/");

  // Just peek at total + first page to size the scanner.
  const [me, peek] = await Promise.all([
    getMe(),
    getLikedSongs(1, 0).catch(() => ({
      items: [],
      total: 0,
      next: null,
    })),
  ]);

  return (
    <main className="min-h-screen flex flex-col">
      <TopBar me={me} active="stats" />

      <Header total={peek.total} />

      <StatsScanner total={peek.total} />

      <footer className="hairline-b mt-auto" />
      <div className="px-8 py-5 flex items-center justify-between label-mono text-mute">
        <span>VOLUMEN 04 · STATS</span>
        <span>{peek.total.toLocaleString("es")} EN BIBLIOTECA</span>
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
            Volumen 04 — El retrato
          </p>
          <h1 className="display-italic text-[clamp(3.5rem,10vw,10rem)] leading-[0.9]">
            Tu
            <br />
            <span className="display not-italic text-cream-dim">retrato.</span>
          </h1>
          <p className="font-serif italic text-lg text-cream-dim mt-8 max-w-md">
            Análisis editorial sobre tu biblioteca de Liked Songs. Lo que
            escuchas dice quién eres.
          </p>
        </div>

        <div className="col-span-12 lg:col-span-4 flex flex-col items-end justify-end fade-in">
          <p className="label-mono text-mute mb-2">Canciones a analizar</p>
          <p
            className="display num-tabular text-[clamp(5rem,16vw,13rem)] text-acid leading-none"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 1' }}
          >
            {total.toLocaleString("es")}
          </p>
        </div>
      </div>
    </section>
  );
}
