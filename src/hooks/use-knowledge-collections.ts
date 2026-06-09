"use client";
import { fetcher } from "lib/utils";
import useSWR from "swr";

export interface KnowledgeCollection {
  id: string;
  name: string;
  description: string | null;
}

export function useKnowledgeCollections() {
  const { data, error, isLoading } = useSWR<{ collections: KnowledgeCollection[] }>(
    "/api/knowledge/collections",
    fetcher,
    { revalidateOnFocus: false },
  );
  return { collections: data?.collections ?? [], error, isLoading };
}
