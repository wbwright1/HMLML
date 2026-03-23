"use client";

import { Button } from "@/components/ui/button";

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
          Data is temporarily unavailable. This may be due to a sync issue or a
          server error. Please try again in a moment.
        </p>
        <p className="text-caption text-muted-foreground mt-2">
          If the problem persists, data may be outdated or the service may be
          under maintenance.
        </p>
      </div>
      <Button onClick={reset} variant="default" size="lg">
        Try again
      </Button>
    </div>
  );
}
