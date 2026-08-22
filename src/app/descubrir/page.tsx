import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMe } from "@/lib/spotify";
import { parseRange } from "@/lib/stats/range";
import { resolveTimeZone } from "@/lib/stats/local-time";
import TopBar from "@/components/TopBar";
import RangePicker from "@/components/stats/RangePicker";
import Descubrimiento from "@/components/Descubrimiento";

export const dynamic = "force-dynamic";

function ahoraMs(): number {
  return Date.now();
}

export default async function Descubrir({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; desde?: string; hasta?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/biblioteca");

  const sp = await searchParams;
  const range = parseRange(sp, ahoraMs(), resolveTimeZone(process.env));
  const me = await getMe();

  return (
    <main className="min-h-screen flex flex-col">
      <TopBar me={me} active="descubrir" />

      <section className="px-8 py-5 hairline-b">
        <RangePicker range={range} base="/descubrir" />
      </section>

      {/* El rango elige las semillas: de qué periodo salen las canciones tuyas
          que se usan para pedir parecidos. */}
      <Descubrimiento preset={sp.preset} />

      <footer className="hairline-b mt-auto" />
      <div className="px-8 py-5 flex items-center justify-between label-mono text-mute">
        <span>DESCUBRIR</span>
        <span>MOTOR LAST.FM</span>
      </div>
    </main>
  );
}
