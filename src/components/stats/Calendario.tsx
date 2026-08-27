import Link from "next/link";
import { duracion } from "@/lib/formato";
import Miniatura from "./Miniatura";
import type { Calendario, Celda, Mes, Anio } from "@/lib/stats/calendario";
import type { DiaDestacado } from "@/lib/stats/dia-destacado";

/** Lunes primero, que es como se lee un calendario aquí. */
const DIAS = ["L", "M", "X", "J", "V", "S", "D"];

/**
 * Fondo por escalón.
 *
 * Van como clases enteras y no compuestas: Tailwind lee el código fuente
 * buscando nombres literales, así que una clase armada por concatenación no
 * llega nunca a la hoja de estilos.
 */
const FONDO = [
  "bg-ink-2",
  "bg-acid/20",
  "bg-acid/40",
  "bg-acid/65",
  "bg-acid/90",
];

/** A partir del escalón tres el fondo es claro y el texto tiene que virar. */
const TEXTO = [
  "text-mute",
  "text-cream-dim",
  "text-cream",
  "text-ink",
  "text-ink",
];

const enlaceA = (fecha: string) => `/historial?desde=${fecha}&hasta=${fecha}`;

function rotulo(c: Celda): string {
  if (c.plays === 0) return `${c.fecha} · sin música`;
  return `${c.fecha} · ${c.plays} escuchas · ${duracion(c.ms)}`;
}

/**
 * Calendario de escuchas, con la forma que pida el rango.
 *
 * La versión anterior usaba la misma casilla de trece píxeles para los cuatro
 * presets. A un año se defendía; a cuatro semanas —el preset por defecto— la
 * rejilla ocupaba ciento seis píxeles de los mil setecientos disponibles, un
 * seis por ciento del ancho, y no había forma de leerla.
 *
 * Aquí la forma la decide el rango: meses de verdad hasta el año, con el número
 * del día escrito, y tiras por año cuando son varios. En los rangos cortos la
 * casilla es lo bastante grande como para llevar dentro lo que más sonó ese
 * día, que es lo que justifica ocupar el ancho.
 *
 * El gráfico de evolución que va justo encima ya cuenta la tendencia, así que
 * esto no la repite: aquí se ve el ritmo semanal, se ven los huecos, y se entra
 * a un día concreto.
 */
export default function CalendarioEscuchas({
  calendario,
  destacados = {},
  caratulas = {},
}: {
  calendario: Calendario;
  /** Lo más sonado de cada día. Solo se usa en la densidad rica. */
  destacados?: Record<string, DiaDestacado>;
  /** Carátulas por clave de canción. Faltan mientras la caché se llena. */
  caratulas?: Record<string, string>;
}) {
  if (calendario.forma === "tiras") {
    return (
      <div className="flex flex-col gap-6">
        {calendario.anios.map((a) => (
          <Tira key={a.anio} anio={a} />
        ))}
        <Leyenda />
      </div>
    );
  }

  const { densidad, meses } = calendario;

  return (
    <div>
      <div
        className={
          densidad === "rica"
            ? "grid gap-x-10 gap-y-8 sm:grid-cols-2"
            : "grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
        }
      >
        {meses.map((m) => (
          <BloqueMes
            key={m.clave}
            mes={m}
            densidad={densidad}
            destacados={destacados}
            caratulas={caratulas}
          />
        ))}
      </div>
      <Leyenda />
    </div>
  );
}

function BloqueMes({
  mes,
  densidad,
  destacados,
  caratulas,
}: {
  mes: Mes;
  densidad: "rica" | "compacta";
  destacados: Record<string, DiaDestacado>;
  caratulas: Record<string, string>;
}) {
  return (
    <div>
      <p className="font-serif italic text-lg text-cream-dim mb-3">{mes.titulo}</p>

      <div className="grid grid-cols-7 gap-1.5">
        {DIAS.map((d, i) => (
          <span
            key={d}
            className={`dato-mono text-center ${
              i >= 5 ? "text-mute/60" : "text-mute"
            }`}
          >
            {d}
          </span>
        ))}

        {mes.celdas.map((c, i) =>
          c === null ? (
            <span key={`h${i}`} aria-hidden />
          ) : densidad === "rica" ? (
            <CasillaRica
              key={c.fecha}
              celda={c}
              destacado={destacados[c.fecha]}
              caratulas={caratulas}
            />
          ) : (
            <CasillaCompacta key={c.fecha} celda={c} />
          ),
        )}
      </div>
    </div>
  );
}

/**
 * La casilla grande: número, cifra y lo que más sonó.
 *
 * La intensidad va como relleno desde abajo y no como color de fondo. Sobre un
 * fondo teñido, el texto o se pierde en los días flojos o hay que virarlo a
 * oscuro en los fuertes, y el bloque acaba con dos colores de letra según el
 * día. Con el relleno detrás, el texto siempre cae sobre el mismo tono.
 */
function CasillaRica({
  celda,
  destacado,
  caratulas,
}: {
  celda: Celda;
  destacado?: DiaDestacado;
  caratulas: Record<string, string>;
}) {
  const vacio = celda.plays === 0;
  const caratula = destacado ? caratulas[destacado.trackKey] : undefined;

  const cuerpo = (
    <>
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 bg-acid/25"
        style={{ height: `${Math.round(celda.ratio * 100)}%` }}
      />

      <span className="relative flex items-baseline justify-between gap-2">
        <span className="dato-mono text-cream-dim">{celda.diaDelMes}</span>
        {!vacio && (
          <span className="num-tabular font-mono text-sm text-acid">
            {celda.plays}
          </span>
        )}
      </span>

      {/* La carátula sale de una caché que se llena por lotes y hoy cubre menos
          del diez por ciento: `Miniatura` pinta las iniciales cuando falta,
          para que el hueco se vea intencionado y no roto. */}
      {destacado && (
        <span className="relative mt-auto flex items-center gap-1.5 pt-2">
          <Miniatura
            nombre={destacado.trackName}
            url={caratula}
            lado={20}
            redondeo="rounded-[3px]"
          />
          <span className="min-w-0 truncate font-serif text-[12px] leading-tight text-cream-dim">
            {destacado.trackName}
          </span>
        </span>
      )}
    </>
  );

  const clases =
    "group relative flex min-h-[92px] flex-col overflow-hidden rounded-lg " +
    "bg-ink-2/70 p-2 ring-1 ring-rule transition-[box-shadow] duration-200 " +
    "outline-none focus-visible:ring-acid";

  if (vacio) {
    return (
      <span className={`${clases} opacity-45`} title={rotulo(celda)}>
        {cuerpo}
      </span>
    );
  }

  return (
    <Link
      href={enlaceA(celda.fecha)}
      className={`${clases} hover:ring-acid/50`}
      title={rotulo(celda)}
    >
      {cuerpo}
    </Link>
  );
}

/** La casilla mediana: solo el número, sobre el escalón de color. */
function CasillaCompacta({ celda }: { celda: Celda }) {
  const clases =
    "flex aspect-square items-center justify-center rounded-md dato-mono " +
    `${FONDO[celda.nivel]} ${TEXTO[celda.nivel]}`;

  if (celda.plays === 0) {
    return (
      <span className={`${clases} opacity-60`} title={rotulo(celda)}>
        {celda.diaDelMes}
      </span>
    );
  }

  return (
    <Link
      href={enlaceA(celda.fecha)}
      title={rotulo(celda)}
      className={`${clases} transition-transform duration-150 hover:scale-110
                  hover:ring-1 hover:ring-cream
                  outline-none focus-visible:ring-1 focus-visible:ring-acid`}
    >
      {celda.diaDelMes}
    </Link>
  );
}

/**
 * Un año entero como tira de semanas.
 *
 * Las columnas se reparten el ancho disponible en vez de medir trece píxeles
 * fijos: cincuenta y tres semanas repartidas en la pantalla dan una casilla dos
 * veces y media más grande, y es la diferencia entre ver el año y adivinarlo.
 */
function Tira({ anio }: { anio: Anio }) {
  return (
    <div className="flex items-center gap-4">
      <span className="display num-tabular w-16 shrink-0 text-2xl text-mute">
        {anio.anio}
      </span>

      <div className="grid shrink-0 grid-rows-7 gap-[3px]">
        {DIAS.map((d, i) => (
          <span
            key={d}
            className="dato-mono flex items-center text-mute"
            style={{ visibility: i % 2 === 0 ? "visible" : "hidden" }}
          >
            {d}
          </span>
        ))}
      </div>

      <div
        className="grid min-w-0 flex-1 grid-flow-col grid-rows-7 gap-[3px]"
        style={{ gridAutoColumns: "minmax(0, 1fr)" }}
      >
        {anio.celdas.map((c, i) =>
          c === null ? (
            <span key={`h${i}`} aria-hidden />
          ) : c.plays === 0 ? (
            <span
              key={c.fecha}
              title={rotulo(c)}
              className="aspect-square rounded-[2px] bg-ink-2"
            />
          ) : (
            <Link
              key={c.fecha}
              href={enlaceA(c.fecha)}
              title={rotulo(c)}
              className={`aspect-square rounded-[2px] ${FONDO[c.nivel]}
                          transition-[box-shadow] duration-150
                          hover:ring-1 hover:ring-cream
                          outline-none focus-visible:ring-1 focus-visible:ring-acid`}
            />
          ),
        )}
      </div>
    </div>
  );
}

function Leyenda() {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="dato-mono text-mute">menos</span>
      {FONDO.map((f, i) => (
        <span key={i} className={`h-3.5 w-3.5 rounded-[3px] ${f}`} aria-hidden />
      ))}
      <span className="dato-mono text-mute">más</span>
      <span className="dato-mono text-mute ml-2">
        cada día lleva a lo que sonó
      </span>
    </div>
  );
}
