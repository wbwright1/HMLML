import { ProfileSkeleton } from "@/components/player-profile/profile-skeleton";

export default function PlayerProfilePageLoading() {
  return (
    <div className="py-8 md:py-12">
      <ProfileSkeleton />
    </div>
  );
}
