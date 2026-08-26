type Tile = {
  label: string;
  valor: string;
  nota?: string;
  acento?: boolean;
};

/**
 * Cifras secundarias como retícula, no como párrafo.
 *
 * Un renglón de texto con cuatro números seguidos obliga a leerlo entero para
 * encontrar uno. En cuadrícula, cada cifra tiene sitio propio y se localiza de
 * un vistazo — que es lo único que se le pide a un dato secundario.
 */
export default function StatTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-rule">
      {tiles.map((t, i) => (
        <div
          key={t.label}
          className="group bg-ink px-5 py-6 rise
                     transition-colors duration-200 hover:bg-ink-2"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <dt className="label-mono text-mute mb-3 transition-colors duration-200 group-hover:text-cream-dim">
            {t.label}
          </dt>
          <dd
            className={`num-tabular text-[clamp(1.6rem,3.4vw,2.6rem)] leading-none ${
              t.acento ? "text-acid" : "text-cream"
            }`}
          >
            {t.valor}
          </dd>
          {t.nota && (
            <dd className="label-mono text-mute mt-2">{t.nota}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}
