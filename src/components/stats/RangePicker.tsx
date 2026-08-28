import Link from "next/link";
import { PRESETS, type StatsRange } from "@/lib/stats/range";
import Pendiente from "@/components/Pendiente";

/**
 * El rango vive en la URL, así que el selector son enlaces, no estado.
 *
 * Cada opción es un `<Link>` que recarga la página con otro `?preset=`. El
 * botón atrás funciona y la vista se puede marcar como favorita.
 *
 * Lo único que viaja al cliente es `<Pendiente>`, el subrayado que acusa el
 * clic mientras el servidor responde. El resto sigue siendo de servidor.
 *
 * `base` es la ruta sobre la que se navega. Sin ella el selector devolvía
 * siempre a la portada, así que cambiar de rango desde el historial o desde
 * una ficha te sacaba de donde estabas.
 */
export default function RangePicker({
  range,
  base = "/",
}: {
  range: StatsRange;
  base?: string;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-4">
      {Object.entries(PRESETS).map(([id, { label }]) => (
        <Link
          key={id}
          href={`${base}?preset=${id}`}
          // `py-3 -my-3` y `px-2 -mx-2`: la zona que se puede tocar crece de
          // unos quince pixeles a casi cuarenta sin mover nada de sitio. El
          // texto mide once y en un telefono era casi imposible acertar.
          className={`label-mono relative -mx-2 -my-3.5 px-2 py-3.5
                      transition-colors duration-200 ${
                        range.preset === id ? "text-acid" : "text-mute hover:text-cream"
                      }`}
        >
          {label}
          <Pendiente />
        </Link>
      ))}
      <span className="label-mono text-mute">
        {range.fromDate} → {range.toDate}
      </span>
    </nav>
  );
}
