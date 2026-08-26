import { haceCuanto } from "./formato";

/** Lo que la captura deja escrito de sí misma tras cada ejecución. */
export type EstadoCaptura = {
  lastRunAt: number | null;
  /** `ok` | `error` | `gap`. */
  lastRunStatus: string | null;
  lastError: string | null;
  gapSuspectedAt: number | null;
};

export type SaludCaptura = {
  nivel: "ok" | "aviso" | "fallo";
  /** Una línea, para avisar desde la portada. */
  titulo: string;
  /** Qué mirar, para quien ya está en el taller. */
  detalle: string;
};

/**
 * Horas sin ejecutarse a partir de las cuales la captura se da por parada.
 *
 * Eran dos, y dos es un umbral pensado para un servidor encendido siempre. En
 * un portátil que duerme por la noche convertía cada mañana en una alarma, y
 * una alarma que salta todos los días deja de leerse. Doce horas sobreviven a
 * una noche y siguen delatando una tarea que se cayó de verdad.
 */
const HORAS_SIN_CORRER = 12;

const SANA: SaludCaptura = { nivel: "ok", titulo: "", detalle: "" };

/**
 * Si la captura está funcionando, y qué decir cuando no.
 *
 * La comprobación de antes solo miraba *cuándo* corrió, no *si* funcionó: con
 * la tarea puntual cada veinte minutos y todas las ejecuciones devolviendo 401,
 * el panel seguía en verde. El estado y la hora son dos preguntas distintas y
 * aquí se hacen las dos.
 */
export function saludCaptura(
  estado: EstadoCaptura | null | undefined,
  ahoraMs: number,
): SaludCaptura {
  if (!estado?.lastRunAt) {
    return {
      nivel: "fallo",
      titulo: "La captura no se ha ejecutado nunca.",
      detalle:
        "No hay ninguna ejecución registrada. Comprueba que la tarea " +
        "programada existe y que has iniciado sesión al menos una vez.",
    };
  }

  const cuando = haceCuanto(estado.lastRunAt, ahoraMs);
  // El error se arrastra a los demás casos: si además lleva un día parada,
  // saber con qué falló la última vez sigue siendo la pista útil.
  const porque = estado.lastError ? ` Último error: ${estado.lastError}` : "";

  if (ahoraMs - estado.lastRunAt > HORAS_SIN_CORRER * 3_600_000) {
    return {
      nivel: "fallo",
      titulo: `La captura no se ejecuta desde ${cuando}.`,
      detalle:
        `La última ejecución fue ${cuando}. Si el equipo ha estado apagado ` +
        `es normal y se pondrá al día sola; si no, revisa la tarea programada.` +
        porque,
    };
  }

  if (estado.lastRunStatus === "error") {
    return {
      nivel: "fallo",
      titulo: `La última captura falló (${cuando}).`,
      detalle: `La captura corre, pero la última terminó con error.${porque}`,
    };
  }

  if (estado.gapSuspectedAt) {
    return {
      nivel: "aviso",
      titulo: "Puede que falten escuchas.",
      detalle:
        `Llegaron 50 escuchas de golpe ${haceCuanto(estado.gapSuspectedAt, ahoraMs)}, ` +
        "que es el máximo que devuelve Spotify: puede que se perdieran algunas " +
        "entre dos ejecuciones.",
    };
  }

  return SANA;
}
