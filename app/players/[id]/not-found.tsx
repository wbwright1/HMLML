import Link from "next/link";
import { UserX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";

export default function PlayerNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <UserX
          className="size-12 text-text-tertiary mb-2"
          strokeWidth={2}
          aria-hidden="true"
        />
        <h1 className="text-h1 text-text-primary">
          Not on any roster we know of.
        </h1>
        <p className="text-body text-text-secondary max-w-md">
          This player doesn&apos;t exist in our records. Maybe they were
          waived, retired, or traded to a league that actually cares.
        </p>
      </div>
      <Link href="/players" className={buttonVariants({ variant: "default", size: "lg" })}>
        Browse players
      </Link>
    </div>
  );
}
