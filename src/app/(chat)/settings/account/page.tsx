import { Suspense } from "react";

import { UserDetailContent } from "@/components/user/user-detail/user-detail-content";
import { UserDetailContentSkeleton } from "@/components/user/user-detail/user-detail-content-skeleton";

// Settings › Account — profile/avatar, password-or-OAuth-only, sessions.
// Reuses the same UserDetailContent the retired User Settings drawer used
// (view="user"). docs/design/information-architecture.md §2.
export default function SettingsAccountPage() {
  return (
    <Suspense fallback={<UserDetailContentSkeleton />}>
      <UserDetailContent view="user" />
    </Suspense>
  );
}
