"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";
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
        <AlertCircle
          className="size-12 text-text-tertiary/50 mb-2"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <h1 className="text-h2">Something went wrong</h1>
        <p className="text-body text-text-tertiary max-w-md">
          Data is temporarily unavailable. This may be a sync issue. Try
          refreshing in a moment.
        </p>
        <p className="text-caption text-text-tertiary mt-2">
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
