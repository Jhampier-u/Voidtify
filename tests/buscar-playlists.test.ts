import { describe, it, expect } from "vitest";
import { buscarPlaylists } from "@/lib/buscar-playlists";

const pl = (name: string, dueño = "Aslan", id = "aslan") => ({
  name,
  owner: { id, display_name: dueño },
});

const LISTA = [
  pl("Classic-Rock"),
  pl("Dream Pop"),
  pl("Cigarettes After Sex"),
  pl("Sigur Rós en bucle"),
  pl("Shoegaze", "Juan Pérez", "juanp"),
];

const nombres = (r: { name: string }[]) => r.map((p) => p.name);

describe("buscarPlaylists", () => {
  it("devuelve todo si no se busca nada", () => {
    expect(buscarPlaylists(LISTA, "")).toHaveLength(5);
    expect(buscarPlaylists(LISTA, "   ")).toHaveLength(5);
  });

  it("encuentra por una parte del nombre", () => {
    expect(nombres(buscarPlaylists(LISTA, "pop"))).toEqual(["Dream Pop"]);
  });

  it("no distingue mayúsculas", () => {
    expect(nombres(buscarPlaylists(LISTA, "DREAM"))).toEqual(["Dream Pop"]);
  });

  // Misma normalizacion que las claves de las estadisticas.
  it("no distingue acentos", () => {
    expect(nombres(buscarPlaylists(LISTA, "sigur ros"))).toEqual([
      "Sigur Rós en bucle",
    ]);
    expect(nombres(buscarPlaylists(LISTA, "PÉREZ"))).toEqual(["Shoegaze"]);
  });

  describe("varios términos", () => {
    // Un includes de la frase entera obligaria a escribir el nombre tal cual.
    it("los acepta en cualquier orden", () => {
      expect(nombres(buscarPlaylists(LISTA, "rock classic"))).toEqual([
        "Classic-Rock",
      ]);
    });

    it("los acepta salteados", () => {
      expect(nombres(buscarPlaylists(LISTA, "cigarettes sex"))).toEqual([
        "Cigarettes After Sex",
      ]);
    });

    // Escribir mas palabras siempre debe reducir, nunca ampliar.
    it("exige que estén todos", () => {
      expect(buscarPlaylists(LISTA, "pop rock")).toEqual([]);
    });
  });

  it("busca también por el dueño", () => {
    expect(nombres(buscarPlaylists(LISTA, "juan"))).toEqual(["Shoegaze"]);
  });

  it("devuelve vacío cuando no hay coincidencias", () => {
    expect(buscarPlaylists(LISTA, "reguetón")).toEqual([]);
  });

  // Spotify devuelve playlists con el nombre vacio, y alguna sin dueño
  // legible. No deben tumbar la busqueda.
  it("aguanta nombres y dueños vacíos", () => {
    const raras = [
      { name: "", owner: { id: "x", display_name: "" } },
      pl("Normal"),
    ];
    expect(nombres(buscarPlaylists(raras, "normal"))).toEqual(["Normal"]);
    expect(buscarPlaylists(raras, "")).toHaveLength(2);
  });

  it("no altera la lista original", () => {
    const copia = [...LISTA];
    buscarPlaylists(LISTA, "pop");
    expect(LISTA).toEqual(copia);
  });
});
