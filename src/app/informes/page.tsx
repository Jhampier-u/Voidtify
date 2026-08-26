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

export const dynamic = "force-dynamic";

const TIPOS: { id: TipoPeriodo; label: string }[] = [
  { id: "semana", label: "Semanas" },
  { id: "mes", label: "Meses" },
  { id: "anio", label: "Años" },
];

function esTipo(v: string | undefined): v is TipoPeriodo {
  return v === "semana" || v === "mes" || v === "anio";
}

/** Variación relativa, o null si no hay con qué comparar. */
function variacion(ahora: number, antes: number): number | null {
  if (antes === 0) return null;
  return (ahora - antes) / antes;
}

function Delta({ valor }: { valor: number | null }) {
  if (valor === null) {
    return <span className="label-mono text-rule">sin comparación</span>;
  }
  const pct = Math.round(valor * 100);
  if (pct === 0) return <span className="label-mono text-mute">igual</span>;
  return (
    <span className={`label-mono ${pct > 0 ? "text-acid" : "text-blood"}`}>
      {pct > 0 ? "+" : ""}
      {pct} %
    </span>
  );
}

/**
 * El movimiento se dice con palabra y con flecha, no solo con color: en verde y
 * rojo, subir y bajar son indistinguibles para buena parte de la gente.
 */
function Movimiento({ fila }: { fila: FilaComparada }) {
  if (fila.movimiento === "nuevo") {
    return <span className="label-mono text-acid">entra</span>;
  }
  if (fila.movimiento === "igual") {
    return <span className="label-mono text-mute">=</span>;
  }
  const sube = fila.movimiento === "sube";
  return (
    <span className={`label-mono num-tabular ${sube ? "text-acid" : "text-blood"}`}>
      {sube ? "↑" : "↓"} {Math.abs(fila.delta ?? 0)}
    </span>
  );
}

function Ranking({
  titulo,
  filas,
  salen,
}: {
  titulo: string;
  filas: FilaComparada[];
  salen: { name: string; posicionAnterior: number }[];
}) {
  return (
    <section>
      <p className="label-mono text-mute mb-4">{titulo}</p>
      {filas.length === 0 ? (
        <p className="font-serif italic text-mute">Nada en este periodo.</p>
      ) : (
        <ol>
          {filas.map((f) => (
            <li
              key={f.key}
              className="flex items-baseline justify-between gap-3 py-2 hairline-b"
            >
              <span className="flex items-baseline gap-3 min-w-0">
                <span className="label-mono num-tabular text-mute w-6 shrink-0">
                  {String(f.posicion).padStart(2, "0")}
                </span>
                <span className="truncate">{f.name}</span>
              </span>
              <span className="flex items-baseline gap-4 shrink-0">
                <Movimiento fila={f} />
                <span className="label-mono num-tabular text-mute">
                  {f.plays.toLocaleString("es")}
                </span>
              </span>
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
        <section className="px-8 py-24">
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

      <section className="px-8 py-5 hairline-b flex items-center gap-6 flex-wrap">
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

      <section className="px-8 py-5 hairline-b overflow-x-auto">
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

      <section className="px-8 pt-16 pb-10 hairline-b">
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
                <Delta valor={t.delta} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="px-8 py-14 grid gap-14 lg:grid-cols-2">
        <Ranking
          titulo="Artistas"
          filas={inf.artistas.filas}
          salen={inf.artistas.salen}
        />
        <Ranking
          titulo="Canciones"
          filas={inf.canciones.filas}
          salen={inf.canciones.salen}
        />
      </section>

      {/* Comparar dos top 15 solo puede hablar de esos quince: «entra» no
          significa que nunca se hubiera escuchado. Decirlo evita leer más de lo
          que el dato sostiene. */}
      <p className="px-8 pb-12 label-mono text-mute max-w-2xl leading-relaxed">
        «Entra» y «sale» se refieren al top 15 de cada periodo, no a tu
        historial completo.
      </p>

      <footer className="hairline-b mt-auto" />
      <div className="px-8 py-5 flex items-center justify-between label-mono text-mute">
        <span>INFORMES</span>
        <span>{periodos.length.toLocaleString("es")} PERIODOS CON DATOS</span>
      </div>
    </main>
  );
}
