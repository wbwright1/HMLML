import { FranchiseLogo } from "@/components/franchise-logo";
import type { OffseasonReceipt, ReceiptCategory } from "@/lib/content";

const CATEGORY_LABELS: Record<ReceiptCategory, string> = {
  DRAFT: "Draft",
  TRADE: "Blockbuster Trade",
  WAIVERS: "Waivers",
  FIRE_SALE: "The Fire Sale",
};

export interface ReceiptFranchise {
  slug: string;
  name: string;
  abbreviation: string | null;
  brandingColor: string | null;
  /** Per-season Sleeper crest; null falls back to the monogram. */
  avatarUrl: string | null;
}

interface OffseasonReceiptCardProps {
  receipt: OffseasonReceipt;
  /** Resolved franchise for the crest; the card renders a fallback crest if null. */
  franchise: ReceiptFranchise;
}

/**
 * An "Offseason Receipts" card: a category kicker top-left, the attributed
 * franchise's crest top-right, and the site-voice recap below.
 */
export function OffseasonReceiptCard({ receipt, franchise }: OffseasonReceiptCardProps) {
  const isFireSale = receipt.category === "FIRE_SALE";
  return (
    <div className="card-surface flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <p className={`text-kicker ${isFireSale ? "text-accent-warm" : "text-accent-gold"}`}>
          {CATEGORY_LABELS[receipt.category]}
        </p>
        <FranchiseLogo
          slug={franchise.slug}
          name={franchise.name}
          abbreviation={franchise.abbreviation ?? undefined}
          brandingColor={franchise.brandingColor ?? undefined}
          avatarUrl={franchise.avatarUrl}
          size="sm"
          decorative
        />
      </div>
      <p className="mt-3 text-body text-text-secondary">{receipt.body}</p>
    </div>
  );
}
