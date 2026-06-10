"use client";

import useSWR from "swr";

import { authClient } from "auth/client";
import { getIsUserAdmin } from "lib/user/utils";
import { fetcher } from "lib/utils";

import {
  type TeamOption,
  VisibilityPicker,
  type VisibilityPickerEntityType,
  type VisibilityValue,
} from "./visibility-picker";

interface TeamspacesResponse {
  teams?: TeamOption[];
}

interface VisibilityFieldProps {
  value: VisibilityValue;
  onChange: (value: VisibilityValue) => void;
  entity?: { type: VisibilityPickerEntityType; id: string };
  disabled?: boolean;
  className?: string;
}

/**
 * Connected wrapper around {@link VisibilityPicker}: pulls the viewer's team
 * memberships (the user-scoped `/api/teamspaces/folders` endpoint, which
 * returns `{ teams }`) and their admin flag from the session, then renders the
 * pure picker. Callers that already have teams + admin in hand can use
 * `VisibilityPicker` directly instead.
 */
export function VisibilityField({
  value,
  onChange,
  entity,
  disabled,
  className,
}: VisibilityFieldProps) {
  const { data: session } = authClient.useSession();
  const isAdmin = getIsUserAdmin(session?.user ?? undefined);

  const { data } = useSWR<TeamspacesResponse>(
    "/api/teamspaces/folders",
    fetcher,
    { revalidateOnFocus: false },
  );

  return (
    <VisibilityPicker
      value={value}
      onChange={onChange}
      teams={data?.teams ?? []}
      isAdmin={isAdmin}
      entity={entity}
      disabled={disabled}
      className={className}
    />
  );
}
