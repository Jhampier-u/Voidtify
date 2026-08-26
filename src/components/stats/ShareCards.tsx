import type { StatsRange } from "@/lib/stats/range";

const TARJETAS = [
  { tipo: "resumen", label: "Resumen", nota: "horas, reproducciones y tu número uno" },
  { tipo: "top-artistas", label: "Top artistas", nota: "tus cinco más escuchados" },
  { tipo: "racha", label: "Racha", nota: "días seguidos con música" },
] as const;

/**
 * Enlaces a las tarjetas PNG de 1080×1920.
 *
 * Son `<a>` normales con `download`, no botones: la ruta devuelve la imagen
 * directamente y el navegador la guarda. Nada de JavaScript de por medio.
 *
 * El rango activo viaja en la URL, así que la tarjeta describe exactamente lo
 * que el usuario está mirando.
 */
export default function ShareCards({ range }: { range: StatsRange }) {
  const query = new URLSearchParams();
  if (range.preset === "custom") {
    query.set("desde", range.fromDate);
    query.set("hasta", range.toDate);
  } else {
    query.set("preset", range.preset);
  }
  const qs = query.toString();

  return (
    <section>
      <p className="label-mono text-mute mb-5">
        Compartir · imágenes de 1080×1920
      </p>

      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-rule">
        {TARJETAS.map((t, i) => (
          <li key={t.tipo} className="bg-ink">
            <a
              href={`/api/card/${t.tipo}?${qs}`}
              download={`voidtify-${t.tipo}.png`}
              className="flex flex-col gap-2 px-5 py-6 hover:bg-ink-2 transition-colors rise"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span className="label-mono text-acid">{t.label} ↓</span>
              <span className="font-serif italic text-cream-dim">{t.nota}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
