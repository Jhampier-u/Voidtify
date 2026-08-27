
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
    <header className="px-8 py-5 flex items-center justify-between hairline-b sticky top-0 bg-ink/85 backdrop-blur-md z-50">
      <div className="flex items-center gap-6">
        <Link
          href="/"
          className="label-mono text-cream hover:text-acid transition-colors"
        >
          LEDGER
        </Link>
        <span className="label-mono text-mute hidden sm:inline">·</span>
        <nav className="hidden sm:flex items-center gap-5">
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
      </div>

      <div className="flex items-center gap-5">
        <div className="hidden md:flex items-center gap-3">
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
          <button className="label-mono text-mute hover:text-acid transition-colors">
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
      className={`label-mono transition-colors ${
        active ? "text-acid" : "text-mute hover:text-cream"
      }`}
    >
      {children}
    </Link>
  );
}
