import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Redirects any `localhost` request to `127.0.0.1` so the OAuth state
 * cookie always lives on the same host Spotify is configured to redirect to.
 * (Spotify rejects localhost in HTTP redirect URIs for new apps.)
 */
export function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  if (host.startsWith("localhost")) {
    const url = req.nextUrl.clone();
    url.host = "127.0.0.1";
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
