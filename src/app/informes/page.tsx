import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { getMe } from "@/lib/spotify";
import { getInforme, periodosConDatos } from "@/lib/stats/informe";
import {
  etiqueta,
  type FilaComparada,
  type TipoPeriodo,
} from "@/lib/stats/periodo";
import TopBar from "@/components/TopBar";
import Miniatura from "@/components/stats/Miniatura";
import {
  CambioDePuesto,
  CambioRelativo,
} from "@/components/stats/Cambio";
import { variacion } from "@/lib/stats/variacion";
import { getCaratulas, getImagenesDeArtistas } from "@/lib/stats/imagenes";

export const dynamic = "force-dynamic";

const TIPOS: { id: TipoPeriodo; label: string }[] = [
  { id: "semana", label: "Semanas" },
  { id: "mes", label: "Meses" },
  { id: "anio", label: "Años" },
];

function esTipo(v: string | undefined): v is TipoPeriodo {
  return v === "semana" || v === "mes" || v === "anio";
}

function Ranking({
  titulo,
  filas,
  salen,
  imagenes,
  hrefBase,
}: {
  titulo: string;
  filas: FilaComparada[];
  salen: { name: string; posicionAnterior: number }[];
  imagenes: Record<string, string>;
  hrefBase: string;
}) {
  return (
    <section>
      <p className="label-mono text-mute mb-4">{titulo}</p>
      {filas.length === 0 ? (
        <p className="font-serif italic text-mute">Nada en este periodo.</p>
      ) : (
        <ol>
          {filas.map((f) => (
            <li key={f.key}>
              <Link
                href={`${hrefBase}/${encodeURIComponent(f.key)}`}
                className="group flex items-center justify-between gap-3 rounded-xl
                           px-2 py-1.5 transition-[transform,background-color]
                           duration-200 ease-out hover:translate-x-1
                           hover:bg-ink-2/50"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="label-mono num-tabular w-6 shrink-0 text-mute
                                   transition-colors duration-200 group-hover:text-cream">
                    {String(f.posicion).padStart(2, "0")}
                  </span>
                  <Miniatura nombre={f.name} url={imagenes[f.key]} lado={34} />
                  <span className="truncate transition-colors duration-200 group-hover:text-acid">
                    {f.name}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-4">
                  <CambioDePuesto delta={f.delta} />
                  <span className="dato-mono text-mute">
                    {f.plays.toLocaleString("es")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {salen.length > 0 && (
        <p className="label-mono text-mute mt-4 leading-relaxed">
          Salen del top:{" "}
          <span className="text-cream-dim">
            {salen.map((s) => s.name).join(" · ")}
          </span>
        </p>
      )}
    </section>
  );
}

export default async function Informes({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; periodo?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/biblioteca");

  const sp = await searchParams;
  const tipo: TipoPeriodo = esTipo(sp.tipo) ? sp.tipo : "mes";

  const [me, periodos] = await Promise.all([
    getMe(),
    periodosConDatos(db, tipo),
  ]);

  // Sin datos no hay informe que dar, y `periodos[0]` sería undefined.
  if (periodos.length === 0) {
    return (
      <main className="min-h-screen flex flex-col">
        <TopBar me={me} active="informes" />
        <section className="px-5 sm:px-8 py-24">
          <p className="font-serif italic text-xl text-cream-dim">
            Todavía no hay escuchas registradas.
          </p>
        </section>
      </main>
    );
  }

  // Un periodo pedido a mano puede no existir; se cae al más reciente en vez de
  // enseñar un informe vacío que parecería un error de los datos.
  const periodo =
    sp.periodo && periodos.includes(sp.periodo) ? sp.periodo : periodos[0];
  const inf = await getInforme(db, tipo, periodo);

  // Depende del informe, asi que va despues: solo las de los quince de cada
  // ranking, no las del periodo entero.
  const [fotos, caratulas] = await Promise.all([
    getImagenesDeArtistas(db, inf.artistas.filas.map((f) => f.key)),
    getCaratulas(db, "cancion", inf.canciones.filas.map((f) => f.key)),
  ]);

  const horas = inf.actual.msTotal / 3_600_000;
  const horasAntes = inf.previo.msTotal / 3_600_000;

  const tiles = [
    {
      label: "Reproducciones",
      valor: inf.actual.reproducciones.toLocaleString("es"),
      delta: variacion(inf.actual.reproducciones, inf.previo.reproducciones),
    },
    {
      label: "Horas",
      valor: horas.toFixed(1),
      delta: variacion(horas, horasAntes),
    },
    {
      label: "Artistas",
      valor: inf.actual.artistas.toLocaleString("es"),
      delta: variacion(inf.actual.artistas, inf.previo.artistas),
    },
    {
      label: "Canciones",
      valor: inf.actual.canciones.toLocaleString("es"),
      delta: variacion(inf.actual.canciones, inf.previo.canciones),
    },
    {
      label: "Días con música",
      valor: inf.actual.diasActivos.toLocaleString("es"),
      delta: variacion(inf.actual.diasActivos, inf.previo.diasActivos),
    },
  ];

  return (
    <main className="min-h-screen flex flex-col">
      <TopBar me={me} active="informes" />

      <section className="px-5 sm:px-8 py-5 hairline-b flex items-center gap-6 flex-wrap">
        {TIPOS.map((t) => (
          <Link
            key={t.id}
            href={`/informes?tipo=${t.id}`}
            className={`label-mono transition-colors ${
              tipo === t.id ? "text-acid" : "text-mute hover:text-cream"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </section>

      <section className="px-5 sm:px-8 py-5 hairline-b overflow-x-auto">
        {/* Se listan todos, sin tope. Cortar a los cuarenta mas recientes
            dejaba 2018 inalcanzable y nada en pantalla lo decia: parecia que
            los datos no llegaban tan atras. */}
        <div className="flex gap-4 min-w-max">
          {periodos.map((p) => (
            <Link
              key={p}
              href={`/informes?tipo=${tipo}&periodo=${p}`}
              className={`label-mono whitespace-nowrap transition-colors ${
                p === periodo ? "text-acid" : "text-mute hover:text-cream"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      </section>

      <section className="px-5 sm:px-8 pt-16 pb-10 hairline-b">
        <p className="label-mono text-mute mb-5">
          frente a {etiqueta(inf.periodoAnterior, tipo)}
        </p>
        <h1 className="display-italic text-[clamp(2.2rem,7vw,5rem)] leading-[0.95]">
          {etiqueta(periodo, tipo)}
        </h1>
      </section>

      <section className="hairline-b">
        <dl className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-rule">
          {tiles.map((t, i) => (
            <div
              key={t.label}
              className="bg-ink px-5 py-6 rise"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <dt className="label-mono text-mute mb-3">{t.label}</dt>
              <dd className="num-tabular text-[clamp(1.3rem,2.6vw,1.9rem)] leading-tight">
                {t.valor}
              </dd>
              <dd className="mt-2">
                <CambioRelativo v={t.delta} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="px-5 sm:px-8 py-14 grid gap-14 lg:grid-cols-2">
        <Ranking
          titulo="Artistas"
          filas={inf.artistas.filas}
          salen={inf.artistas.salen}
          imagenes={fotos}
          hrefBase="/escucha/artista"
        />
        <Ranking
          titulo="Canciones"
          filas={inf.canciones.filas}
          salen={inf.canciones.salen}
          imagenes={caratulas}
          hrefBase="/escucha/cancion"
        />
      </section>

      {/* Comparar dos top 15 solo puede hablar de esos quince: «entra» no
          significa que nunca se hubiera escuchado. Decirlo evita leer más de lo
          que el dato sostiene. */}
      <p className="px-5 sm:px-8 pb-12 label-mono text-mute max-w-2xl leading-relaxed">
        «Entra» y «sale» se refieren al top 15 de cada periodo, no a tu
        historial completo.
      </p>

      <footer className="hairline-b mt-auto" />
      <div className="px-5 sm:px-8 py-5 flex items-center justify-between label-mono text-mute">
        <span>INFORMES</span>
        <span>{periodos.length.toLocaleString("es")} PERIODOS CON DATOS</span>
      </div>
    </main>
  );
}
