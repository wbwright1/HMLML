import { SectionHeader } from "@/components/section-header";

export default function SectionHeaderTestPage() {
  return (
    <div className="py-8 space-y-12">
      <h1 className="text-h1">Section Header Test Fixtures</h1>

      <div data-testid="title-only">
        <SectionHeader title="Recent Transactions" />
        <p className="text-body">Content below the title-only header.</p>
      </div>

      <div data-testid="with-default-link">
        <SectionHeader title="Last Season's Best" viewAllHref="/records" />
        <p className="text-body">Content below the default link header.</p>
      </div>

      <div data-testid="with-custom-link">
        <SectionHeader
          title="2024 Draft"
          viewAllHref="/drafts/2024"
          viewAllLabel="Full Draft →"
        />
        <p className="text-body">Content below the custom link header.</p>
      </div>

      <div data-testid="long-title">
        <SectionHeader
          title="All-Time Statistical Leaders and Records"
          viewAllHref="/records"
        />
        <p className="text-body">Content below the long title header.</p>
      </div>

      <div data-testid="standings-title-only">
        <SectionHeader title="Standings" />
        <p className="text-body">Content below standings header.</p>
      </div>
    </div>
  );
}
