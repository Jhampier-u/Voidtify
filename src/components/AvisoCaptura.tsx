import Link from "next/link";
import type { SaludCaptura } from "@/lib/salud-captura";

/**
 * Banda de aviso cuando la captura no está recogiendo escuchas.
 *
 * El estado ya se veía en el taller, pero al taller solo se entra a propósito:
 * la captura estuvo devolviendo 401 durante tres cuartos de hora y en pantalla
 * no cambió nada. Aquí ocupa sitio solo cuando hay algo roto, y lleva al sitio
 * donde se arregla.
 */
export default function AvisoCaptura({ salud }: { salud: SaludCaptura }) {
  if (salud.nivel === "ok") return null;

  const fallo = salud.nivel === "fallo";

  return (
    <Link
      href="/ajustes"
      className={`hairline-b group flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 sm:px-8 py-3 transition-colors duration-200 ${
        fallo ? "bg-blood/10 hover:bg-blood/15" : "bg-tag-amber/10 hover:bg-tag-amber/15"
      }`}
    >
      <span className={`label-mono ${fallo ? "text-blood" : "text-tag-amber"}`}>
        {fallo ? "captura detenida" : "posible hueco"}
      </span>
      <span className="font-serif italic text-cream-dim">{salud.titulo}</span>
      <span className="dato-mono text-mute ml-auto shrink-0 transition-colors duration-200 group-hover:text-cream">
        ver el taller →
      </span>
    </Link>
  );
}
