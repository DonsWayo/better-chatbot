"use client";

import { cn, fetcher } from "lib/utils";
import { AtSignIcon, SearchIcon } from "lucide-react";
import { FC, useRef, useState } from "react";
import useSWR from "swr";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "ui/popover";

interface UserResult {
  id: string;
  name: string;
  image?: string;
}

interface Props {
  top: number;
  left: number;
  onClose: () => void;
  onSelectMention: (item: { label: string; id: string }) => void;
  style?: React.CSSProperties;
}

export const UserMentionSuggestion: FC<Props> = ({
  onClose,
  onSelectMention,
  style,
}) => {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data } = useSWR<{ users: UserResult[] }>(
    `/api/users/search?q=${encodeURIComponent(q)}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const users = data?.users ?? [];

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <PopoverTrigger asChild>
        <span className="fixed z-50" style={style} />
      </PopoverTrigger>
      <PopoverContent data-testid="mention-suggestion" className="w-64 p-0" align="start" side="top">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <SearchIcon className="size-3.5 shrink-0 opacity-50" />
          <input
            ref={inputRef}
            autoFocus
            className="flex h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search colleagues…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && users.length > 0) {
                e.preventDefault();
                onSelectMention({ label: users[0].name, id: users[0].id });
              }
              if (e.key === "Backspace" && !e.currentTarget.value) onClose();
            }}
          />
        </div>
        <div className="max-h-52 overflow-y-auto py-1">
          {users.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              {q ? "No colleagues found" : "Type to search…"}
            </div>
          ) : (
            users.map((u) => (
              <button
                key={u.id}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-1.5 text-sm",
                  "hover:bg-accent hover:text-accent-foreground",
                )}
                onClick={() => onSelectMention({ label: u.name, id: u.id })}
              >
                <Avatar className="size-5 shrink-0 rounded-full">
                  <AvatarImage src={u.image} />
                  <AvatarFallback>{u.name[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="truncate">{u.name}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const UserMentionItem: FC<{ label: string; id: string }> = ({
  label,
}) => (
  <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 text-xs font-semibold text-primary">
    <AtSignIcon className="size-2.5" />
    {label}
  </span>
);
