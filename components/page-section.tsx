interface PageSectionProps {
  label?: string;
  title: string;
  /**
   * Heading level. Use "h1" for the page head (the first section on a route):
   * it renders the larger page-title size. Page heads take no `label`
   * (no kicker stacked above a page title) and one short `intro` line.
   */
  as?: "h1" | "h2";
  /** One short line under the title, secondary text. */
  intro?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageSection({
  label,
  title,
  as = "h2",
  intro,
  children,
}: PageSectionProps) {
  const Heading = as;
  return (
    <section className="py-8 md:py-12 space-y-6">
      <div className="space-y-2">
        {label && <p className="text-kicker">{label}</p>}
        <Heading className={as === "h1" ? "text-h1" : "text-h2"}>{title}</Heading>
        {intro && (
          <p className="text-body text-text-secondary max-w-prose">{intro}</p>
        )}
      </div>

      {children}
    </section>
  );
}
