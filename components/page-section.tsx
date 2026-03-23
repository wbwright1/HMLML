interface PageSectionProps {
  label?: string;
  title: string;
  children: React.ReactNode;
}

export function PageSection({ label, title, children }: PageSectionProps) {
  return (
    <section className="py-24 space-y-12">
      <div className="space-y-2">
        {label && (
          <p className="text-caption uppercase tracking-widest text-primary">
            {label}
          </p>
        )}
        <h2 className="text-h2">{title}</h2>
      </div>

      {children}
    </section>
  );
}
