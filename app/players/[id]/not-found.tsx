import Link from "next/link";
import { UserX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";

export default function PlayerNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <UserX
          className="size-12 text-text-tertiary/50 mb-2"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <p className="text-kicker text-text-tertiary">Player 404</p>
        <h1 className="text-h1 font-serif italic text-text-primary">
          Not on any roster we know of.
        </h1>
        <p className="text-body text-text-tertiary max-w-md">
          This player doesn&apos;t exist in our records. Maybe they were
          waived, retired, or traded to a league that actually cares.
        </p>
      </div>
      <Link href="/players" className={buttonVariants({ variant: "default", size: "lg" })}>
        Browse Players
      </Link>
    </div>
  );
}
