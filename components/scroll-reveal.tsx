interface ScrollRevealProps {
  children: React.ReactNode;
  delay?: number;
}

export function ScrollReveal({ children, delay = 0 }: ScrollRevealProps) {
  return (
    <div className="reveal-on-load" style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
