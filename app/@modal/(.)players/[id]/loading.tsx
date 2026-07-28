import { ProfileModalShell } from "@/components/player-profile/profile-modal-shell";
import { ProfileSkeleton } from "@/components/player-profile/profile-skeleton";

/** Renders the shell immediately (the modal opens instantly) with a skeleton body. */
export default function InterceptedPlayerModalLoading() {
  return (
    <ProfileModalShell>
      <ProfileSkeleton />
    </ProfileModalShell>
  );
}
