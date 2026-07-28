// Required by Next.js parallel routes: a fallback for the implicit `children`
// slot on hard navigation / refresh when no matching page segment exists at
// this level. Always empty — the real content renders through app/page.tsx
// and nested route segments.
export default function Default() {
  return null;
}
