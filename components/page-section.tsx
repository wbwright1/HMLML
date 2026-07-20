interface PageSectionProps {
  label?: string;
  title: string;
  children: React.ReactNode;
}

export function PageSection({ label, title, children }: PageSectionProps) {
  return (
    <section className="py-8 md:py-12 space-y-6">
      <div className="space-y-2">
        {label && <p className="text-kicker">{label}</p>}
        <h2 className="text-h2">{title}</h2>
      </div>

      {children}
    </section>
  );
}
