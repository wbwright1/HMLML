/**
 * Test fixture page that throws unconditionally.
 * Used by E2E tests to trigger the error.tsx boundary.
 * This page should not be linked from production navigation.
 */

// Force dynamic rendering so this page is not pre-rendered at build time.
export const dynamic = "force-dynamic";

export default function ErrorTriggerPage() {
  throw new Error("Intentional error for E2E testing of error boundary");
}
