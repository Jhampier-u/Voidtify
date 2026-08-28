import { sentidoDePuesto, type Variacion } from "@/lib/stats/variacion";

/**
 * Cómo se enseña un cambio, en un solo sitio.
 *
 * Había cinco implementaciones repartidas —dos de porcentaje y tres de puesto—
 * y habían derivado: la misma entrada nueva se llamaba «entra» en informes y
 * «nuevo» en géneros, y un cambio que redondea a cero salía como «igual» en
 * una pantalla y como nada en otra. Nada de eso es una decisión, es olvido.
 *
 * El movimiento se dice con palabra y con flecha, nunca solo con color: en
 * verde y rojo, subir y bajar son indistinguibles para buena parte de la
 * gente. El criterio ya estaba escrito en los informes y aquí se hereda.
 */

/**
 * Cambio de una cifra frente al mismo periodo anterior.
 *
 * `igual` se escribe en vez de callarse. Sin él no se distingue «no ha
 * cambiado» de «no hay con qué comparar», que son cosas muy distintas —y en la
 * portada se estaba callando, que era la decisión equivocada.
 */
export function CambioRelativo({ v }: { v: Variacion }) {
  if (v.sentido === "desconocido") {
    return <span className="label-mono text-mute">sin comparación</span>;
  }
  if (v.sentido === "estreno") {
    return (
      <span
        className="label-mono text-acid"
        title="no hubo nada en el mismo periodo anterior"
      >
        estreno
      </span>
    );
  }
  if (v.sentido === "igual") {
    return <span className="label-mono text-mute">igual</span>;
  }

  const sube = v.sentido === "sube";
  return (
    <span
      className={`label-mono num-tabular ${sube ? "text-acid" : "text-blood"}`}
      title="frente al mismo periodo anterior, de igual duración"
    >
      {sube ? "↑" : "↓"} {Math.abs(v.pct ?? 0)} %
    </span>
  );
}

/**
 * Puestos ganados o perdidos dentro de un ranking.
 *
 * Se compara la posición y no el porcentaje: el peso de una entrada depende de
 * todas las demás, así que basta con que aparezca algo nuevo muy escuchado
 * para que el resto baje unas décimas sin haber cambiado nada.
 */
export function CambioDePuesto({ delta }: { delta: number | null | undefined }) {
  const sentido = sentidoDePuesto(delta);

  if (sentido === "entra") {
    return <span className="label-mono text-acid">entra</span>;
  }
  if (sentido === "igual") {
    return <span className="label-mono text-mute">=</span>;
  }

  const sube = sentido === "sube";
  return (
    <span
      className={`label-mono num-tabular ${sube ? "text-acid" : "text-blood"}`}
      title={`${sube ? "sube" : "baja"} ${Math.abs(delta ?? 0)} ${
        Math.abs(delta ?? 0) === 1 ? "puesto" : "puestos"
      }`}
    >
      {sube ? "↑" : "↓"} {Math.abs(delta ?? 0)}
    </span>
  );
}
