
import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/auth";
import type { SpotifyUser } from "@/lib/spotify";

export default function TopBar({
  me,
  active,
}: {
  me: SpotifyUser;
  active?:
    | "portada"
    | "historial"
    | "descubrir"
    | "informes"
    | "biblioteca"
    | "guardadas"
    | "tags"
    | "ajustes";
}) {
  return (
    <header
      className="hairline-b sticky top-0 z-50 flex items-center gap-4
                 bg-ink/85 px-5 py-4 backdrop-blur-md sm:gap-6 sm:px-8 sm:py-5"
    >
      <Link
        href="/"
        className="label-mono shrink-0 text-cream transition-colors hover:text-acid"
      >
        LEDGER
      </Link>

      {/* Se desplaza en horizontal en vez de esconderse. Estaba en
          `hidden sm:flex`, asi que por debajo de 640 px no habia navegacion
          ninguna: en el movil solo se veian el logo y el avatar y no habia
          forma de cambiar de seccion. Desplazable evita duplicar el marcado
          para dos disposiciones y evita un menu desplegable, que en ocho
          destinos son dos toques donde antes habia uno. */}
      <nav className="sin-barra flex min-w-0 flex-1 items-center gap-5 overflow-x-auto">
        <NavLink href="/" active={active === "portada"}>
          Portada
        </NavLink>
        <NavLink href="/descubrir" active={active === "descubrir"}>
          Descubrir
        </NavLink>
        <NavLink href="/informes" active={active === "informes"}>
          Informes
        </NavLink>
        <NavLink href="/historial" active={active === "historial"}>
          Historial
        </NavLink>
        <NavLink href="/biblioteca" active={active === "biblioteca"}>
          Biblioteca
        </NavLink>
        <NavLink href="/guardadas" active={active === "guardadas"}>
          Guardadas
        </NavLink>
        <NavLink href="/tags" active={active === "tags"}>
          Tags
        </NavLink>
        <NavLink href="/ajustes" active={active === "ajustes"}>
          Ajustes
        </NavLink>
      </nav>

      <div className="flex shrink-0 items-center gap-5">
        <div className="hidden items-center gap-3 md:flex">
          {me.images?.[0]?.url ? (
            <Image
              src={me.images[0].url}
              alt=""
              width={56}
              height={56}
              className="h-7 w-7 rounded-full object-cover ring-1 ring-rule"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-ink-3" />
          )}
          <div className="text-right leading-tight">
            <p className="font-mono text-xs text-cream">{me.display_name}</p>
            <p className="font-mono text-[10px] text-mute">{me.email}</p>
          </div>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="label-mono text-mute transition-colors hover:text-acid">
            Salir →
          </button>
        </form>
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      // `whitespace-nowrap`: sin el, «Biblioteca» se parte en dos lineas
      // dentro del carril desplazable y descuadra la barra entera.
      className={`label-mono shrink-0 whitespace-nowrap transition-colors ${
        active ? "text-acid" : "text-mute hover:text-cream"
      }`}
    >
      {children}
    </Link>
  );
}
