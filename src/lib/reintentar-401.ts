import { SpotifyApiError } from "./spotify-core";

/**
 * Rehace la petición con un token nuevo cuando Spotify contesta 401.
 *
 * Un access token puede morir antes de su fecha de caducidad: basta con que se
 * emita otro para la misma cuenta, y entonces el guardado deja de valer aunque
 * le queden cincuenta minutos. Sin este reintento la captura se queda
 * contestando 401 cada veinte minutos hasta que el token caduca por sí solo, y
 * en un servidor sin nadie mirando eso es una hora de silencio: los errores se
 * registran, pero nadie los lee.
 *
 * Se reintenta una sola vez. Si el segundo token también da 401, el problema no
 * es el token —permisos retirados, aplicación desautorizada— y repetir solo
 * gastaría peticiones contra el límite.
 */
export async function conTokenRenovable<T>(
  /** Devuelve el token; con `forzar`, uno recién pedido a Spotify. */
  token: (forzar: boolean) => Promise<string>,
  peticion: (token: string) => Promise<T>,
): Promise<T> {
  const guardado = await token(false);
  try {
    return await peticion(guardado);
  } catch (error) {
    if (!(error instanceof SpotifyApiError) || error.status !== 401) throw error;

    const nuevo = await token(true);
    // Si el refresco devolvió el mismo token, repetir daría el mismo 401: se
    // deja pasar el error original, que dice más que uno inventado aquí.
    if (nuevo === guardado) throw error;

    return peticion(nuevo);
  }
}
