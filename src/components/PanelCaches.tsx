import type { EstadoCache } from "@/lib/estado-caches";
import type { EstadoCopias } from "@/lib/estado-copias";

function pct(r: number, t: number) {
  return t === 0 ? 0 : Math.min(1, r / t);
}

/**
 * Qué llevan hecho los rellenos de fondo y cuándo fue la última copia.
 *
 * Cuatro cachés se llenan solas desde la captura, a lotes pequeños, durante
 * semanas. Sin verlas, un trabajo lento es indistinguible de uno roto: hasta
 * ahora la única forma de saber si avanzaban era consultar la base a mano.
 */
export default function PanelCaches({
  caches,
  copias,
}: {
  caches: EstadoCache[];
  copias: EstadoCopias;
}) {
  return (
    <section className="px-5 sm:px-8 py-10 hairline-b">
      <p className="label-mono text-mute mb-2">Trabajo de fondo</p>
      <p className="font-serif italic text-cream-dim mb-8 max-w-2xl">
        Se rellenan solas con cada captura, a lotes pequeños para no agotar el
        límite de peticiones. La barra mide lo escuchado en los últimos noventa
        días, que es lo que sale en pantalla y lo que se resuelve primero; el
        archivo entero tarda semanas y eso es normal.
      </p>

      <ul className="flex flex-col gap-4 max-w-3xl">
        {caches.map((c) => {
          // La barra mide lo reciente, no el archivo entero: es lo que predice
          // si las pantallas se ven completas. El total va detrás, en pequeño.
          const p = pct(c.recientes, c.totalRecientes);
          const completo = c.totalRecientes > 0 && c.recientes >= c.totalRecientes;

          return (
            <li key={c.nombre}>
              <div className="mb-1.5 flex items-baseline justify-between gap-4">
                <span className="truncate">{c.nombre}</span>
                <span className="dato-mono shrink-0 text-mute">
                  {c.recientes.toLocaleString("es")} de{" "}
                  {c.totalRecientes.toLocaleString("es")}
                  <span className="text-rule"> · </span>
                  <span className={completo ? "text-acid" : "text-cream-dim"}>
                    {(p * 100).toFixed(0)} %
                  </span>
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-ink-2">
                <div
                  className={`h-full rounded-full ${
                    completo ? "bg-acid" : "bg-acid/45"
                  }`}
                  style={{ width: `${p * 100}%` }}
                />
              </div>

              <p className="dato-mono text-mute mt-1.5">
                {c.nota}
                <span className="text-rule"> · </span>
                {c.resueltos.toLocaleString("es")} de{" "}
                {c.total.toLocaleString("es")} en todo el archivo
              </p>
            </li>
          );
        })}
      </ul>

      <div className="mt-10">
        <p className="label-mono text-mute mb-2">Copias de seguridad</p>
        {copias.ultima ? (
          <>
            <p className="font-serif text-lg text-cream-dim">
              La última es del{" "}
              <span className="text-cream">{copias.ultima.fecha}</span>
              {copias.diasDesde !== null && copias.diasDesde > 2 && (
                // Se avisa a partir de dos dias: la tarea es diaria, asi que un
                // hueco mayor significa que el equipo lleva tiempo apagado o
                // que la tarea dejo de correr.
                <span className="text-blood">
                  {" "}
                  — hace {copias.diasDesde} días
                </span>
              )}
            </p>
            <p className="dato-mono text-mute mt-2">
              {copias.cuantas} guardadas · {copias.ultima.mb} MB la última ·{" "}
              {copias.carpeta}
            </p>
          </>
        ) : (
          <p className="font-serif italic text-cream-dim max-w-2xl">
            Todavía no hay ninguna copia en{" "}
            <span className="font-mono not-italic text-mute">
              {copias.carpeta}
            </span>
            . La tarea diaria la crea la primera vez que corre.
          </p>
        )}
      </div>
    </section>
  );
}
