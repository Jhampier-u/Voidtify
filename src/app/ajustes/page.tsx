import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { streams } from "@/db/schema";
import { getMe } from "@/lib/spotify";
import { getCaptureState } from "@/lib/capture/run-capture";
import { listarArchivos } from "@/lib/import/import-actions";
import TopBar from "@/components/TopBar";
import { getEstadoCaches } from "@/lib/estado-caches";
import { getEstadoCopias } from "@/lib/estado-copias";
import CaptureHealth from "@/components/CaptureHealth";
import PanelCaches from "@/components/PanelCaches";
import ImportPanel from "@/components/ImportPanel";

export const dynamic = "force-dynamic";

/** `Date.now()` en el cuerpo del componente lo veta `react-hooks/purity`. */
function ahoraMs(): number {
  return Date.now();
}

export default async function AjustesPage() {
  const session = await auth();
  // A /biblioteca directamente: «/» es la portada de estadisticas y sin
  // sesion redirige aqui de todos modos, asi que ir por ella eran dos saltos.
  if (!session) redirect("/biblioteca");

  // Un solo instante para toda la pagina: con una llamada por sitio, «hace 12 h»
  // y el umbral de las doce horas podian calcularse con relojes distintos.
  const ahora = ahoraMs();

  const [me, estado, conteo, archivos, caches] = await Promise.all([
    getMe(),
    getCaptureState(),
    db.select({ n: sql<number>`count(*)` }).from(streams),
    listarArchivos(),
    getEstadoCaches(db, ahora),
  ]);

  // Lee el disco, no una tabla: lo que importa no es que el script diga que
  // copio, sino que el archivo este ahi.
  const copias = getEstadoCopias(ahora);

  return (
    <main className="min-h-screen flex flex-col">
      <TopBar me={me} active="ajustes" />

      <section className="px-8 py-16 hairline-b">
        <p className="label-mono text-acid mb-6">Ajustes</p>
        <h1 className="display-italic text-[clamp(3rem,8vw,7rem)] leading-[0.9]">
          El taller.
        </h1>
      </section>

      <CaptureHealth
        estado={estado ?? null}
        lastRunInserted={estado?.lastRunInserted ?? null}
        totalStreams={conteo[0]?.n ?? 0}
        ahoraMs={ahora}
      />

      <PanelCaches caches={caches} copias={copias} />

      <ImportPanel archivos={archivos} />

      <section className="px-8 py-10">
        <p className="label-mono text-mute mb-4">Zona horaria</p>
        <p className="font-serif italic text-lg text-cream-dim">
          STATS_TZ ={" "}
          <span className="font-mono not-italic">
            {process.env.STATS_TZ ?? "sin configurar"}
          </span>
        </p>
      </section>

      <footer className="hairline-b mt-auto" />
      <div className="px-8 py-5 flex items-center justify-between label-mono text-mute">
        <span>TALLER</span>
      </div>
    </main>
  );
}
