/* eslint-disable @next/next/no-img-element -- Satori renderiza fuera del
   navegador: `next/image` no existe ahi y solo entiende <img> con url
   absoluta. */
import type { DatosTarjeta, Entrada } from "./tipos";

/**
 * Los dibujos de las tarjetas. Funciones puras de datos a JSX.
 *
 * Las renderiza Satori, no un navegador: solo flexbox —nada de `grid`—,
 * posicionamiento absoluto, degradados, rotaciones y `<img>` con url absoluta.
 * No hay hoja de estilos, así que todo va en `style` y los colores en crudo.
 *
 * Sin dependencias de base de datos a propósito: así se pueden renderizar en
 * una prueba y mirar el PNG. Las tarjetas anteriores se diseñaron sin poder
 * verlas nunca, y se notaba.
 */

export const INK = "#0c0a09";
export const INK_2 = "#15110f";
export const CREAM = "#f4ede4";
export const CREAM_DIM = "#c4bdb2";
export const MUTE = "#83796b";
export const RULE = "#2a2521";
export const ACID = "#d2ff3a";

type Medidas = { ancho: number; alto: number };

/** Escala todo respecto al lienzo vertical, que es el de referencia. */
const escalaDe = (m: Medidas) => m.alto / 1920;

/**
 * Encoge el cuerpo de letra según lo largo que sea el nombre.
 *
 * Satori no sabe ajustar texto a una caja, así que o se escala a mano o un
 * título como «Main Title (from Game of Thrones) - from "House of the Dragon:
 * Season 3"» se come tres líneas y desequilibra la tarjeta.
 */
function tamanoPorLargo(nombre: string, grande: number, medio: number, chico: number) {
  if (nombre.length > 46) return chico;
  if (nombre.length > 22) return medio;
  return grande;
}

function Cabecera({ etiqueta, k }: { etiqueta: string; k: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
      <span
        style={{
          fontFamily: "JetBrains",
          fontSize: 26 * k,
          letterSpacing: 4 * k,
          color: ACID,
        }}
      >
        {etiqueta.toUpperCase()}
      </span>
      <span
        style={{
          fontFamily: "JetBrains",
          fontSize: 26 * k,
          letterSpacing: 4 * k,
          color: MUTE,
        }}
      >
        VOIDTIFY
      </span>
    </div>
  );
}

function Pie({ texto, k }: { texto: string; k: number }) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        borderTop: `${Math.max(1, Math.round(2 * k))}px solid ${RULE}`,
        paddingTop: 28 * k,
        fontFamily: "JetBrains",
        fontSize: 24 * k,
        letterSpacing: 3 * k,
        color: MUTE,
      }}
    >
      {texto.toUpperCase()}
    </div>
  );
}

/**
 * El marco común: fondo, márgenes, cabecera y pie.
 *
 * `justifyContent: space-between` con tres hijos deja el contenido centrado
 * verticalmente sin tener que calcular alturas, que en Satori no se pueden
 * medir.
 */
function Marco({
  etiqueta,
  pie,
  medidas,
  fondo,
  children,
}: {
  etiqueta: string;
  pie: string;
  medidas: Medidas;
  /** Capa que va detrás de todo, en posición absoluta. */
  fondo?: React.ReactNode;
  children: React.ReactNode;
}) {
  const k = escalaDe(medidas);
  return (
    <div
      style={{
        width: medidas.ancho,
        height: medidas.alto,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        backgroundColor: INK,
        color: CREAM,
        padding: 90 * k,
        fontFamily: "Fraunces",
      }}
    >
      {fondo}
      <Cabecera etiqueta={etiqueta} k={k} />
      {children}
      <Pie texto={pie} k={k} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Cartel de festival con los artistas más escuchados.
 *
 * El número uno enorme y el resto en tres escalones. Es la forma que hace que
 * un ranking se lea como un cartel y no como una lista: en un cartel de verdad
 * el tamaño ES la posición, así que no hacen falta ni números ni cifras.
 *
 * La foto del cabeza de cartel ocupa la mitad superior de verdad, con un
 * degradado que solo muerde el borde inferior. En la primera versión iba al
 * 28 % de opacidad y velada entera: quedaba un borrón gris que no se leía como
 * una imagen, que era justo lo que había que arreglar.
 *
 * Abajo, las cifras. Sin ellas el cartel es bonito y no dice nada, y quedaba
 * medio lienzo vacío.
 */
export function Cartel({
  datos,
  medidas,
}: {
  datos: DatosTarjeta;
  medidas: Medidas;
}) {
  const k = escalaDe(medidas);
  const [cabeza, ...resto] = datos.topArtistas;
  const segundos = resto.slice(0, 2);
  const terceros = resto.slice(2, 5);
  const cuartos = resto.slice(5, 11);

  // La banda de foto ocupa más en vertical que en cuadrado: en 1080×1080 una
  // banda del 55 % no dejaría sitio para el cartel.
  const bandaAlto = medidas.alto > medidas.ancho ? medidas.alto * 0.52 : medidas.alto * 0.42;

  const fila = (lista: Entrada[], tam: number, color: string, clave: string) =>
    lista.length === 0 ? null : (
      <div
        key={clave}
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "baseline",
          width: "100%",
          marginTop: 22 * k,
        }}
      >
        {lista.map((a, i) => (
          <div key={a.nombre} style={{ display: "flex", alignItems: "baseline" }}>
            {i > 0 && (
              <span
                style={{
                  fontSize: tam * 0.8,
                  color: MUTE,
                  marginLeft: 16 * k,
                  marginRight: 16 * k,
                }}
              >
                ·
              </span>
            )}
            <span style={{ fontSize: tam, color, lineHeight: 1.25 }}>
              {a.nombre}
            </span>
          </div>
        ))}
      </div>
    );

  return (
    <Marco
      etiqueta={`Cartel · ${datos.etiqueta}`}
      pie={datos.periodo}
      medidas={medidas}
      fondo={
        cabeza?.imagen ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: medidas.ancho,
              height: bandaAlto,
              display: "flex",
            }}
          >
            <img
              alt=""
              src={cabeza.imagen}
              width={medidas.ancho}
              height={bandaAlto}
              style={{ objectFit: "cover" }}
            />
            {/* Solo muerde el borde: en el centro la foto se ve tal cual. */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: medidas.ancho,
                height: bandaAlto,
                background: `linear-gradient(to bottom, rgba(12,10,9,0.72) 0%, rgba(12,10,9,0.18) 34%, rgba(12,10,9,0.55) 72%, ${INK} 100%)`,
              }}
            />
          </div>
        ) : undefined
      }
    >
      {/* Crece para ocupar lo que queda entre la banda y el pie, y se centra
          ahí dentro. Con un margen fijo, el sobrante caía todo abajo y dejaba
          una franja muerta de doscientos píxeles. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flexGrow: 1,
          width: "100%",
          paddingTop: bandaAlto * 0.45,
        }}
      >
        {cabeza && (
          <span
            style={{
              fontSize: 122 * k,
              color: ACID,
              lineHeight: 1.08,
              textAlign: "center",
              letterSpacing: -2 * k,
            }}
          >
            {cabeza.nombre}
          </span>
        )}
        {fila(segundos, 64 * k, CREAM, "b")}
        {fila(terceros, 42 * k, CREAM_DIM, "c")}
        {fila(cuartos, 29 * k, MUTE, "d")}

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "center",
            width: "100%",
            marginTop: 70 * k,
            fontFamily: "JetBrains",
            fontSize: 30 * k,
            letterSpacing: 2 * k,
            color: CREAM_DIM,
          }}
        >
          <span style={{ color: ACID, fontSize: 40 * k }}>{datos.horas}</span>
          <span style={{ marginLeft: 10 * k }}>H</span>
          <span style={{ color: MUTE, marginLeft: 22 * k, marginRight: 22 * k }}>·</span>
          <span style={{ color: ACID, fontSize: 40 * k }}>
            {datos.reproducciones.toLocaleString("es")}
          </span>
          <span style={{ marginLeft: 10 * k }}>REPRODUCCIONES</span>
        </div>
      </div>
    </Marco>
  );
}

/**
 * Mosaico de carátulas para el fondo.
 *
 * Se recorta a un múltiplo de la fila para que no quede un hueco a media
 * última línea, que es lo que delata que un mosaico es un relleno.
 */
function Mosaico({
  urls,
  ancho,
  alto,
  porFila,
}: {
  urls: string[];
  ancho: number;
  alto: number;
  porFila: number;
}) {
  const lado = ancho / porFila;
  const filas = Math.ceil(alto / lado);
  const cuantas = filas * porFila;
  if (urls.length === 0) return null;

  // Se repite la lista si no hay suficientes: un mosaico a medias se ve peor
  // que uno con repeticiones, que a este tamaño no se notan.
  const completa = Array.from({ length: cuantas }, (_, i) => urls[i % urls.length]);

  return (
    // `overflow: hidden` recorta la última fila al alto pedido. Sin él, la
    // rejilla sobresalía por debajo del degradado y esa fila quedaba a plena
    // luz, como una franja pegada.
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: ancho,
        height: alto,
        display: "flex",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", width: ancho, height: filas * lado }}>
        {completa.map((u, i) => (
          <img key={i} alt="" src={u} width={lado} height={lado} style={{ objectFit: "cover" }} />
        ))}
      </div>
      {/* Arranca muy oscuro: la cabecera va encima y sobre una carátula clara
          no se leía. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: ancho,
          height: alto,
          background: `linear-gradient(to bottom, rgba(12,10,9,0.86) 0%, rgba(12,10,9,0.55) 18%, rgba(12,10,9,0.78) 62%, ${INK} 97%)`,
        }}
      />
    </div>
  );
}

/**
 * Resumen: las cifras grandes sobre un mosaico de carátulas.
 *
 * El mosaico va detrás y muy apagado. No es decoración: son las carátulas de lo
 * que sonó en el periodo, así que la tarjeta enseña de qué está hecho el número
 * además de decirlo.
 */
export function Resumen({ datos, medidas }: { datos: DatosTarjeta; medidas: Medidas }) {
  const k = escalaDe(medidas);
  const bandaAlto = medidas.alto * (medidas.alto > medidas.ancho ? 0.56 : 0.46);
  const uno = datos.topArtistas[0];

  return (
    <Marco
      etiqueta={datos.etiqueta}
      pie={datos.periodo}
      medidas={medidas}
      fondo={
        <Mosaico
          urls={datos.mosaico}
          ancho={medidas.ancho}
          alto={bandaAlto}
          porFila={medidas.alto > medidas.ancho ? 4 : 5}
        />
      }
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "flex-end",
          width: "100%",
        }}
      >
        <span style={{ fontSize: 260 * k, color: ACID, lineHeight: 0.9 }}>
          {datos.horas.toLocaleString("es")}
        </span>
        <span style={{ fontSize: 56 * k, color: CREAM_DIM, marginTop: 16 * k }}>
          horas de música
        </span>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 60 * k,
            borderTop: `${Math.max(1, Math.round(2 * k))}px solid ${RULE}`,
            paddingTop: 36 * k,
          }}
        >
          <span style={{ fontSize: 42 * k, color: MUTE }}>
            {datos.reproducciones.toLocaleString("es")} reproducciones ·{" "}
            {datos.artistas.toLocaleString("es")} artistas
          </span>
          {uno && (
            <div style={{ display: "flex", alignItems: "center", marginTop: 34 * k }}>
              {uno.imagen && (
                <img
                  alt=""
                  src={uno.imagen}
                  width={92 * k}
                  height={92 * k}
                  style={{ borderRadius: 92 * k, objectFit: "cover", marginRight: 26 * k }}
                />
              )}
              <span style={{ fontSize: 46 * k, color: CREAM }}>
                sobre todo {uno.nombre}
              </span>
            </div>
          )}
        </div>
      </div>
    </Marco>
  );
}

/**
 * Los cinco más escuchados, con su foto.
 *
 * Con retrato y no solo nombre: un ranking de texto es una lista de la compra,
 * y la cara es lo que lo convierte en algo que apetece enseñar.
 */
export function TopArtistas({ datos, medidas }: { datos: DatosTarjeta; medidas: Medidas }) {
  const k = escalaDe(medidas);
  const cuantos = medidas.alto > medidas.ancho ? 5 : 4;
  const lista = datos.topArtistas.slice(0, cuantos);
  const max = Math.max(1, ...lista.map((a) => a.plays));
  const lado = (medidas.alto > medidas.ancho ? 168 : 120) * k;

  return (
    <Marco
      etiqueta={`Top artistas · ${datos.etiqueta}`}
      pie={datos.periodo}
      medidas={medidas}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "center",
          width: "100%",
        }}
      >
        {lista.map((a, i) => (
          <div
            key={a.nombre}
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              paddingTop: 26 * k,
              paddingBottom: 26 * k,
              borderTop: i === 0 ? "none" : `${Math.max(1, Math.round(2 * k))}px solid ${RULE}`,
            }}
          >
            {/* `flexShrink: 0` en todo lo de ancho fijo: sin él, Satori
                aplasta estas columnas hasta cero y el puesto y las cifras
                desaparecen de la tarjeta sin avisar. */}
            <span
              style={{
                fontFamily: "JetBrains",
                fontSize: 34 * k,
                color: i === 0 ? ACID : MUTE,
                width: 74 * k,
                flexShrink: 0,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>

            {a.imagen ? (
              <img
                alt=""
                src={a.imagen}
                width={lado}
                height={lado}
                style={{ borderRadius: lado, objectFit: "cover", flexShrink: 0 }}
              />
            ) : (
              <div
                style={{
                  width: lado,
                  height: lado,
                  borderRadius: lado,
                  backgroundColor: INK_2,
                  display: "flex",
                  flexShrink: 0,
                }}
              />
            )}

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginLeft: 34 * k,
                flexGrow: 1,
                flexShrink: 1,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: tamanoPorLargo(a.nombre, 58, 46, 38) * k,
                  color: i === 0 ? ACID : CREAM,
                  lineHeight: 1.15,
                }}
              >
                {a.nombre}
              </span>
              {/* La barra da la proporción: sin ella, el primero y el quinto
                  parecen igual de escuchados hasta leer las cifras. */}
              <div
                style={{
                  display: "flex",
                  width: "100%",
                  height: 8 * k,
                  marginTop: 14 * k,
                  backgroundColor: INK_2,
                  borderRadius: 8 * k,
                }}
              >
                <div
                  style={{
                    width: `${(a.plays / max) * 100}%`,
                    height: 8 * k,
                    backgroundColor: i === 0 ? ACID : RULE,
                    borderRadius: 8 * k,
                  }}
                />
              </div>
            </div>

            <span
              style={{
                fontFamily: "JetBrains",
                fontSize: 34 * k,
                color: MUTE,
                marginLeft: 26 * k,
                flexShrink: 0,
              }}
            >
              {a.plays}
            </span>
          </div>
        ))}
      </div>
    </Marco>
  );
}

/**
 * La racha: días seguidos con música.
 *
 * Sin imágenes a propósito. Es la única cifra de la portada que no habla de
 * qué escuchas sino de constancia, y meterle carátulas la disfrazaría de otra
 * cosa. El número solo, enorme, es el mensaje entero.
 */
export function Racha({ datos, medidas }: { datos: DatosTarjeta; medidas: Medidas }) {
  const k = escalaDe(medidas);
  return (
    <Marco etiqueta={`Racha · ${datos.etiqueta}`} pie={datos.periodo} medidas={medidas}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "center",
          width: "100%",
        }}
      >
        <span style={{ fontSize: 340 * k, color: ACID, lineHeight: 0.85 }}>
          {datos.racha}
        </span>
        <span style={{ fontSize: 62 * k, color: CREAM_DIM, marginTop: 24 * k }}>
          días seguidos con música
        </span>
        <span
          style={{
            fontFamily: "JetBrains",
            fontSize: 34 * k,
            letterSpacing: 2 * k,
            color: MUTE,
            marginTop: 70 * k,
          }}
        >
          {`TU MÁXIMA SON ${datos.rachaMaxima} DÍAS`}
        </span>
      </div>
    </Marco>
  );
}

/**
 * Portada de disco: tu número uno como si fuera un vinilo.
 *
 * La carátula ocupa casi todo el ancho y el texto va debajo, que es como se
 * mira una funda de verdad — la imagen primero y el nombre después. Con la
 * carátula pequeña y el texto grande volvería a ser una ficha con una foto al
 * lado, que es de lo que veníamos.
 */
export function Disco({ datos, medidas }: { datos: DatosTarjeta; medidas: Medidas }) {
  const k = escalaDe(medidas);
  const uno = datos.topCanciones[0];
  const margen = 90 * k;
  const lado = Math.min(medidas.ancho - margen * 2, medidas.alto * 0.5);

  return (
    <Marco
      etiqueta={`Tu número uno · ${datos.etiqueta}`}
      pie={datos.periodo}
      medidas={medidas}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
        }}
      >
        {uno?.imagen ? (
          <img
            alt=""
            src={uno.imagen}
            width={lado}
            height={lado}
            style={{ objectFit: "cover", flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: lado,
              height: lado,
              backgroundColor: INK_2,
              display: "flex",
              flexShrink: 0,
            }}
          />
        )}

        <span
          style={{
            fontSize: tamanoPorLargo(uno?.nombre ?? "", 84, 62, 44) * k,
            color: CREAM,
            lineHeight: 1.1,
            marginTop: 54 * k,
            textAlign: "center",
          }}
        >
          {uno?.nombre ?? "Nada todavía"}
        </span>

        {uno?.secundario && (
          <span
            style={{
              fontSize: 50 * k,
              color: ACID,
              marginTop: 18 * k,
              textAlign: "center",
            }}
          >
            {uno.secundario}
          </span>
        )}

        {uno && (
          <span
            style={{
              fontFamily: "JetBrains",
              fontSize: 32 * k,
              letterSpacing: 2 * k,
              color: MUTE,
              marginTop: 40 * k,
            }}
          >
            {`${uno.plays} REPRODUCCIONES · ${Math.round(uno.ms / 60000)} MIN`}
          </span>
        )}
      </div>
    </Marco>
  );
}

/**
 * Contraportada: el tracklist con sus carátulas.
 *
 * Numerado y con la duración a la derecha, como el reverso de una funda. Las
 * carátulas van pequeñas: aquí mandan el orden y los nombres, y una imagen
 * grande por fila convertiría la lista en un catálogo.
 */
export function Tracklist({ datos, medidas }: { datos: DatosTarjeta; medidas: Medidas }) {
  const k = escalaDe(medidas);
  const vertical = medidas.alto > medidas.ancho;
  const lista = datos.topCanciones.slice(0, vertical ? 10 : 6);
  const lado = (vertical ? 78 : 66) * k;

  return (
    <Marco
      etiqueta={`Cara A · ${datos.etiqueta}`}
      pie={datos.periodo}
      medidas={medidas}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "center",
          width: "100%",
        }}
      >
        {lista.map((c, i) => (
          <div
            key={`${c.nombre}-${i}`}
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              paddingTop: 18 * k,
              paddingBottom: 18 * k,
              borderTop:
                i === 0 ? "none" : `${Math.max(1, Math.round(2 * k))}px solid ${RULE}`,
            }}
          >
            <span
              style={{
                fontFamily: "JetBrains",
                fontSize: 30 * k,
                color: i === 0 ? ACID : MUTE,
                width: 66 * k,
                flexShrink: 0,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>

            {c.imagen ? (
              <img
                alt=""
                src={c.imagen}
                width={lado}
                height={lado}
                style={{ objectFit: "cover", flexShrink: 0 }}
              />
            ) : (
              <div
                style={{
                  width: lado,
                  height: lado,
                  backgroundColor: INK_2,
                  display: "flex",
                  flexShrink: 0,
                }}
              />
            )}

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginLeft: 28 * k,
                flexGrow: 1,
                flexShrink: 1,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: tamanoPorLargo(c.nombre, 42, 34, 30) * k,
                  color: i === 0 ? ACID : CREAM,
                  lineHeight: 1.15,
                }}
              >
                {c.nombre}
              </span>
              {c.secundario && (
                <span style={{ fontSize: 28 * k, color: MUTE, marginTop: 6 * k }}>
                  {c.secundario}
                </span>
              )}
            </div>

            <span
              style={{
                fontFamily: "JetBrains",
                fontSize: 30 * k,
                color: MUTE,
                marginLeft: 24 * k,
                flexShrink: 0,
              }}
            >
              {c.plays}
            </span>
          </div>
        ))}
      </div>
    </Marco>
  );
}

export const DIBUJOS = {
  resumen: Resumen,
  "top-artistas": TopArtistas,
  cartel: Cartel,
  disco: Disco,
  tracklist: Tracklist,
  racha: Racha,
} as const;
