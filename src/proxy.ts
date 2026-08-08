import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Manda a `127.0.0.1` a quien llegue por `localhost`.
 *
 * Spotify no admite `localhost` como URI de retorno en apps nuevas, así que la
 * app pide siempre la vuelta a `127.0.0.1`. Si el navegador estaba en
 * `localhost`, las galletas de estado y PKCE se guardan en ese origen y la
 * vuelta aterriza en el otro: son orígenes distintos, no se envían, y Auth.js
 * corta con «unexpected "state" response parameter value». Desde fuera parece
 * que el botón de entrar está roto.
 *
 * El salto NO se hace con una redirección normal. Este fork de Next reescribe
 * la cabecera `Location` a una ruta relativa aunque se le pase una URL absoluta
 * con otro host — comprobado con `NextResponse.redirect`, con `NextResponse`
 * a mano y con una `Response` pelada, las tres dan `location: /ruta`. El
 * navegador la resuelve contra `localhost` y vuelve a entrar aquí: bucle
 * infinito. Ya pasó una vez y costó borrar este archivo entero.
 *
 * Una página puente esquiva el problema porque el destino viaja en el cuerpo,
 * donde nadie lo toca.
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host");
  if (!host) return NextResponse.next();

  // Solo `localhost`, con o sin puerto. Cualquier otro host se deja en paz: el
  // cron llama por 127.0.0.1 y no debe tocarse.
  if (host.split(":")[0].toLowerCase() !== "localhost") {
    return NextResponse.next();
  }

  // Solo GET. La página puente salta con `location.replace`, que siempre emite
  // un GET: un POST interceptado llegaría al destino convertido en GET y sin
  // cuerpo. Eso rompía el envío del formulario de entrada — Auth.js exige POST
  // en /api/auth/signin/spotify y respondía «UnknownAction», que la pantalla
  // presenta como «Server error / problem with the server configuration».
  //
  // No hace falta más: quien navega a localhost salta a 127.0.0.1 antes de
  // pulsar nada, así que el POST ya sale del origen correcto.
  if (request.method !== "GET") return NextResponse.next();

  // Solo navegación. Una petición de datos que recibiera HTML en vez de JSON
  // fallaría de una forma mucho más confusa que el problema que resolvemos.
  if (!request.headers.get("accept")?.includes("text/html")) {
    return NextResponse.next();
  }

  const destino = new URL(request.url);
  destino.protocol = "http:";
  destino.host = host.replace(/^localhost/i, "127.0.0.1");
  const url = destino.toString();

  // El destino se escapa antes de incrustarlo: viene de la URL pedida, que la
  // controla quien hace la petición.
  const seguro = url.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
      `<meta http-equiv="refresh" content="0;url=${seguro}">` +
      `<title>Voidtify</title>` +
      `<style>body{background:#0c0a09;color:#c4bdb2;font:14px ui-monospace,monospace;` +
      `display:grid;place-content:center;height:100vh;margin:0;text-align:center;line-height:1.8}` +
      `a{color:#d2ff3a}</style></head><body>` +
      `<p>Spotify no admite <b>localhost</b>.<br>Te llevo a <b>127.0.0.1</b>…</p>` +
      `<p><a href="${seguro}">Seguir</a></p>` +
      `<script>location.replace(${JSON.stringify(url)})</script>` +
      `</body></html>`,
    {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
