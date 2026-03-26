"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-h2">Something went wrong</h1>
        <p className="text-body text-muted-foreground max-w-md">
          Data is temporarily unavailable. This may be a sync issue. Try
          refreshing in a moment.
        </p>
        <p className="text-caption text-muted-foreground mt-2">
          We&apos;re showing the last available data.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button onClick={reset} variant="default" size="lg">
          Try again
        </Button>
        <Link
          href="/"
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
