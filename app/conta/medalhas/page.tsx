import { BadgeGrid } from "@/components/badge-grid";
import { requireUser } from "@/lib/auth";
import { getBadgeChains, syncBadges } from "@/lib/data/gamification";

export const metadata = { title: "Medalhas" };

export default async function BadgesPage() {
  const session = await requireUser("/conta/medalhas");
  try {
    await syncBadges(session.userId); // grava as medalhas novas e avisa no sininho
  } catch (e) {
    console.error("[badges]", e);
  }
  const chains = await getBadgeChains(session.userId);
  const earned = chains.reduce((n, c) => n + c.tiers.filter((t) => t.earned).length, 0);
  const total = chains.reduce((n, c) => n + c.tiers.length, 0);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">Medalhas</h1>
        <p className="text-sm text-muted">{earned} de {total} conquistadas. Cada medalha destrava a próxima da mesma linha.</p>
      </div>
      <BadgeGrid chains={chains} />
    </div>
  );
}
