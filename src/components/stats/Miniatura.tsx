import Image from "next/image";

/**
 * Foto de artista o carátula, con las iniciales como respaldo.
 *
 * Las cachés se rellenan por lotes desde la captura, así que «todavía no la
 * tengo» es un estado normal durante días. Se pintan las iniciales y no un
 * rectángulo gris para que el hueco parezca una decisión y no un fallo de
 * carga.
 */
export default function Miniatura({
  nombre,
  url,
  lado,
  redondeo = "rounded-lg",
}: {
  nombre: string;
  url?: string;
  lado: number;
  redondeo?: string;
}) {
  const iniciales = nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <span
      style={{ width: lado, height: lado }}
      className={`relative grid shrink-0 place-items-center overflow-hidden
                  bg-ink-3 ring-1 ring-rule/70 ${redondeo}`}
    >
      {url ? (
        <Image
          src={url}
          alt=""
          width={lado * 2}
          height={lado * 2}
          className="h-full w-full object-cover transition-transform duration-500
                     group-hover:scale-105"
        />
      ) : (
        <span
          className="font-mono text-mute select-none"
          style={{ fontSize: Math.max(9, Math.round(lado / 3.4)) }}
        >
          {iniciales}
        </span>
      )}
    </span>
  );
}
