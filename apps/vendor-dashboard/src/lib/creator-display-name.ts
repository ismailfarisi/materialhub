// Vendors browsing the creator directory / media kit never see a creator's
// full display_name — only their first name, with "MaterialHub" standing in for
// the rest. Full identity stays behind the invite flow (see the note atop
// creators/[id]/page.tsx: no handles, no email, no full name until collab).
export function creatorDisplayName(fullName: string): string {
  const firstName = fullName.trim().split(/\s+/)[0];
  return firstName ? `${firstName} MaterialHub` : fullName;
}
