/**
 * Decide quién puede entrar en la instancia.
 *
 * Vive aparte del callback de Auth.js y sin dependencias para poder probarse:
 * un control de acceso que solo se puede verificar iniciando sesión a mano, con
 * dos cuentas de Spotify distintas, en la práctica no se verifica nunca.
 */

export type Decision =
  | { permitir: true; motivo: "sin-duenio" | "en-lista" }
  | { permitir: false; motivo: "sin-id" | "fuera-de-lista" | "error-al-leer" };

/**
 * `guardada` es el identificador que ya tiene la instalación, o null si aún no
 * tiene dueño. `null` y la cadena "me" significan lo mismo: identidad
 * desconocida. "me" era el valor que se guardaba cuando el perfil de Spotify no
 * traía id, y tratarlo como una identidad real dejaría al dueño fuera para
 * siempre.
 */
export function decidirAcceso(
  entorno: string | undefined,
  guardada: string | null,
  idPerfil: string | undefined,
): Decision {
  const delEntorno = (entorno ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const permitidos =
    delEntorno.length > 0
      ? delEntorno
      : guardada && guardada !== "me"
        ? [guardada]
        : [];

  // Instancia recién montada: el primero que entra la reclama. Denegar aquí
  // dejaría fuera al dueño de una instalación nueva, que es peor que el riesgo
  // que evita: sin credenciales guardadas todavía no hay nada que proteger.
  if (permitidos.length === 0) return { permitir: true, motivo: "sin-duenio" };

  if (!idPerfil) return { permitir: false, motivo: "sin-id" };

  return permitidos.includes(idPerfil)
    ? { permitir: true, motivo: "en-lista" }
    : { permitir: false, motivo: "fuera-de-lista" };
}
