import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { getMe } from "@/lib/spotify";
import { resolveTimeZone, localParts } from "@/lib/stats/local-time";
import {
  getContraste,
  contarTomas,
  type Contraste,
  type Entidad,
  type SpotifyRange,
} from "@/lib/stats/snapshots";
import TopBar from "@/components/TopBar";
import Miniatura from "@/components/stats/Miniatura";
import { normalizeName } from "@/lib/stats/normalize";

export const dynamic = "force-dynamic";

const RANGOS: SpotifyRange[] = ["short_term", "medium_term", "long_term"];

function ahoraMs(): number {
  return Date.now();
}

/*
 * Los nombres se comparan con `normalizeName`, la misma funcion que genera las
 * claves de las estadisticas. Aqui habia una copia casi identica que no
 * colapsaba los espacios repetidos: bastaba un nombre con doble espacio en una
 * lista y no en la otra para que se contaran como distintos y las dos salieran
 * marcadas como exclusivas.
 */

type Fila = {
  name: string;
  plays?: number;
  imagen?: string;
  href?: string;
};

function Columna({
  titulo,
  nota,
  items,
  otros,
}: {
  titulo: string;
  nota: string;
  items: Fila[];
  otros: Set<string>;
}) {
  return (
    <div>
      <p className="label-mono text-mute mb-1">{titulo}</p>
      <p className="dato-mono text-mute mb-4">{nota}</p>
      <ol>
        {items.map((x, i) => {
          const soloAqui = !otros.has(normalizeName(x.name));

          const cuerpo = (
            <>
              <span className="flex min-w-0 items-center gap-3">
                <span className="label-mono num-tabular w-6 shrink-0 text-mute">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Miniatura nombre={x.name} url={x.imagen} lado={34} />
                <span
                  className={`truncate transition-colors duration-200 ${
                    soloAqui ? "text-acid" : "group-hover:text-acid"
                  }`}
                >
                  {x.name}
                </span>
              </span>
              {x.plays !== undefined && (
                <span className="dato-mono shrink-0 text-mute">
                  {x.plays.toLocaleString("es")}
                </span>
              )}
            </>
          );

          const clases =
            "group flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 " +
            "transition-[transform,background-color] duration-200 ease-out";

          return (
            <li key={`${x.name}-${i}`}>
              {/* Solo enlaza lo que existe en tu historial. Lo que Spotify
                  pone y tu no has escuchado no tiene ficha que abrir. */}
              {x.href ? (
                <Link
                  href={x.href}
                  className={`${clases} hover:translate-x-1 hover:bg-ink-2/50`}
                >
                  {cuerpo}
                </Link>
              ) : (
                <div className={clases}>{cuerpo}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Bloque({ c, entidad }: { c: Contraste; entidad: Entidad }) {
  const enSpotify = new Set(c.spotify.map((x) => normalizeName(x.name)));
  const enPropio = new Set(c.propio.map((p) => normalizeName(p.name)));

  const coinciden = c.spotify.filter((x) =>
    enPropio.has(normalizeName(x.name)),
  ).length;

  const base = entidad === "artists" ? "/escucha/artista" : "/escucha/cancion";

  // Lo que Spotify lista y tú sí escuchas tiene ficha; el resto, no. Se busca
  // por el nombre normalizado porque la toma de Spotify no guarda nuestra
  // clave.
  const clavePorNombre = new Map(
    c.propio.map((p) => [normalizeName(p.name), p.key]),
  );

  // La columna propia reaprovecha la imagen de la toma cuando el nombre
  // coincide: es la misma entidad y ya está ahí, sin consultar nada.
  const imagenPorNombre = new Map(
    c.spotify
      .filter((x) => x.imagen)
      .map((x) => [normalizeName(x.name), x.imagen as string]),
  );

  return (
    <section className="px-8 py-12 hairline-b">
      <div className="flex items-baseline justify-between gap-4 mb-8 flex-wrap">
        <h2 className="display-italic text-3xl">{c.label}</h2>
        <p className="label-mono text-mute">
          coinciden {coinciden} de {Math.min(c.spotify.length, c.propio.length)}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <Columna
          titulo="Según Spotify"
          nota="su ranking, con criterios que no publica"
          items={c.spotify.map((x) => {
            const clave = clavePorNombre.get(normalizeName(x.name));
            return {
              name: x.name,
              imagen: x.imagen,
              href: clave ? `${base}/${encodeURIComponent(clave)}` : undefined,
            };
          })}
          otros={enPropio}
        />
        <Columna
          titulo="Según tus escuchas"
          nota="contando reproducciones, sin ponderar"
          items={c.propio.map((p) => ({
            name: p.name,
            plays: p.plays,
            imagen: imagenPorNombre.get(normalizeName(p.name)),
            href: `${base}/${encodeURIComponent(p.key)}`,
          }))}
          otros={enSpotify}
        />
      </div>
    </section>
  );
}

export default async function Contraste({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/biblioteca");

  const sp = await searchParams;
  const entidad: Entidad = sp.e === "tracks" ? "tracks" : "artists";

  const timeZone = resolveTimeZone(process.env);
  const hoy = localParts(ahoraMs(), timeZone).localDate;

  const [me, tomas, ...contrastes] = await Promise.all([
    getMe(),
    contarTomas(db),
    ...RANGOS.map((r) => getContraste(db, entidad, r, hoy)),
  ]);

  const disponibles = contrastes.filter((c): c is Contraste => c !== null);

  return (
    <main className="min-h-screen flex flex-col">
      <TopBar me={me} active="portada" />

      <section className="px-8 py-5 hairline-b flex items-center justify-between gap-4 flex-wrap">
        <nav className="flex gap-5">
          <Link
            href="/escucha/contraste"
            className={`label-mono transition-colors ${
              entidad === "artists" ? "text-acid" : "text-mute hover:text-cream"
            }`}
          >
            Artistas
          </Link>
          <Link
            href="/escucha/contraste?e=tracks"
            className={`label-mono transition-colors ${
              entidad === "tracks" ? "text-acid" : "text-mute hover:text-cream"
            }`}
          >
            Canciones
          </Link>
        </nav>
        <Link href="/" className="label-mono text-mute hover:text-acid transition-colors">
          ← Portada
        </Link>
      </section>

      <section className="px-8 pt-16 pb-12 hairline-b">
        <p className="label-mono text-acid mb-6">Contraste</p>
        <h1
          className="display-italic text-[clamp(2.4rem,8vw,6rem)] leading-[0.9]"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 1' }}
        >
          Lo que Spotify
          <br />
          cree que escuchas.
        </h1>
        <p className="font-serif italic text-xl text-cream-dim mt-8 max-w-2xl">
          Sus rankings se calculan con criterios que no publica, y la recencia
          pesa mucho. Los tuyos son un recuento literal. Que discrepen no es un
          error de nadie — es la diferencia entre lo que un algoritmo cree de ti
          y lo que hiciste. En <span className="text-acid not-italic">acento</span>{" "}
          lo que aparece en una lista y no en la otra.
        </p>
      </section>

      {disponibles.length === 0 ? (
        <section className="px-8 py-24">
          <p className="font-serif italic text-xl text-cream-dim max-w-lg">
            Todavía no hay ninguna toma guardada. El cron guarda una al día
            junto con la captura de escuchas.
          </p>
        </section>
      ) : (
        disponibles.map((c) => (
          <Bloque key={c.timeRange} c={c} entidad={entidad} />
        ))
      )}

      <footer className="hairline-b mt-auto" />
      <div className="px-8 py-5 flex items-center justify-between label-mono text-mute">
        <span>CONTRASTE</span>
        <span>
          {tomas} {tomas === 1 ? "TOMA GUARDADA" : "TOMAS GUARDADAS"}
        </span>
      </div>
    </main>
  );
}
