"use client";

import { useLinkStatus } from "next/link";

/**
 * Subrayado que aparece mientras se navega al enlace que lo contiene.
 *
 * Va dentro del `<Link>` a propósito: `useLinkStatus` lee el estado del enlace
 * más cercano, así que el componente que lo usa puede seguir siendo de
 * servidor. Solo esta pieza viaja al cliente.
 *
 * Existe porque las pantallas de estadísticas consultan la base entera y no
 * tienen `loading.tsx`: al pulsar un rango no pasaba nada visible durante la
 * espera, y una interfaz que no acusa el clic se siente rota antes que lenta.
 */
export default function Pendiente() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute -bottom-1 left-0 h-[2px] bg-acid
                  transition-[width,opacity] duration-300 ease-out ${
                    pending ? "w-full opacity-100" : "w-0 opacity-0"
                  }`}
    />
  );
}
