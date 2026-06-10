import { notFound, redirect, unauthorized } from "next/navigation";
import { getUserAccounts, getUser } from "lib/user/server";
import { UserDetail } from "@/components/user/user-detail/user-detail";
import {
  UserStatsCardLoader,
  UserStatsCardLoaderSkeleton,
} from "@/components/user/user-detail/user-stats-card-loader";
import { UserAdminActions } from "@/components/admin/user-admin-actions";
import { UserModelGrants } from "@/components/admin/user-model-grants";

import { Suspense } from "react";
import { getSession } from "auth/server";
import { requireAdminPermission } from "auth/permissions";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function UserDetailPage({ params }: PageProps) {
  const { id } = await params;
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }
  const [user, userAccountInfo] = await Promise.all([
    getUser(id),
    getUserAccounts(id),
  ]);

  if (!user) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <UserDetail
        user={user}
        currentUserId={session.user.id}
        userAccountInfo={userAccountInfo}
        userStatsSlot={
          <Suspense fallback={<UserStatsCardLoaderSkeleton />}>
            <UserStatsCardLoader userId={id} view="admin" />
          </Suspense>
        }
        view="admin"
      />
      <div className="px-4 md:px-6 pb-6 max-w-3xl space-y-4">
        <UserAdminActions userId={id} />
        <UserModelGrants userId={id} />
      </div>
    </div>
  );
}
