// The @modal parallel-route slot's default: renders nothing on any hard load
// (direct navigation, refresh) so a full page load never shows a stray modal.
// The modal only appears when Next.js intercepts a same-app soft navigation
// via app/@modal/(.)players/[id]/page.tsx.
export default function ModalDefault() {
  return null;
}
