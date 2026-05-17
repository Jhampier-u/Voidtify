import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMe } from "@/lib/spotify";
import { listTags } from "@/lib/tag-actions";
import TopBar from "@/components/TopBar";
import TagsManager from "@/components/TagsManager";

export default async function TagsPage() {
  const session = await auth();
  if (!session) redirect("/");

  const [me, tags] = await Promise.all([getMe(), listTags()]);

  const totalApplications = tags.reduce((s, t) => s + t.trackCount, 0);

  return (
    <main className="min-h-screen flex flex-col">
      <TopBar me={me} active="tags" />

      <Header total={tags.length} totalApplications={totalApplications} />

      <TagsManager initial={tags} />

      <footer className="hairline-b mt-auto" />
      <div className="px-8 py-5 flex items-center justify-between label-mono text-mute">
        <span>VOLUMEN 05 · TAGS</span>
        <span>
          {tags.length} TAGS · {totalApplications.toLocaleString("es")}{" "}
          APLICACIONES
        </span>
      </div>
    </main>
  );
}

function Header({
  total,
  totalApplications,
}: {
  total: number;
  totalApplications: number;
}) {
  return (
    <section className="px-8 py-16 lg:py-20 hairline-b">
      <div className="grid grid-cols-12 gap-6 items-end">
        <div className="col-span-12 lg:col-span-8 fade-in">
          <p className="label-mono text-acid mb-6">
            Volumen 05 — Tu vocabulario
          </p>
          <h1 className="display-italic text-[clamp(3.5rem,10vw,10rem)] leading-[0.9]">
            Tags.
          </h1>
          <p className="font-serif italic text-lg text-cream-dim mt-8 max-w-md">
            Las etiquetas que tú decides ponerle a tu música. Lo que Spotify no
            te deja decir.
          </p>
        </div>

        <div className="col-span-12 lg:col-span-4 flex flex-col items-end justify-end fade-in">
          <p className="label-mono text-mute mb-2">
            Total · {totalApplications.toLocaleString("es")} aplicaciones
          </p>
          <p
            className="display num-tabular text-[clamp(5rem,16vw,13rem)] text-acid leading-none"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 1' }}
          >
            {total}
          </p>
        </div>
      </div>
    </section>
  );
}
