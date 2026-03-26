import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-h2">This page doesn&apos;t exist.</h1>
        <p className="text-body text-muted-foreground max-w-md">
          Maybe it was traded away.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/"
          className={buttonVariants({ variant: "default", size: "lg" })}
        >
          Go to Hub
        </Link>
        <Link
          href="/teams"
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Browse Teams
        </Link>
      </div>
    </div>
  );
}
