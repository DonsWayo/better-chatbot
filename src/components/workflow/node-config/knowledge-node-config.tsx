"use client";

import { useEdges, useNodes, useReactFlow } from "@xyflow/react";
import { KnowledgeNodeData, UINode } from "lib/ai/workflow/workflow.interface";
import { memo, useCallback } from "react";
import useSWR from "swr";
import { Input } from "ui/input";
import { Label } from "ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";

import { OutputSchemaMentionInput } from "../output-schema-mention-input";

import { InfoIcon } from "lucide-react";

import { TipTapMentionJsonContent } from "app-types/util";
import { fetcher } from "lib/utils";

import { useWorkflowStore } from "@/app/store/workflow.store";
import type { KnowledgeCollectionSummary } from "@/components/knowledge/types";
import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

interface KnowledgeNodeConfigProps {
  data: KnowledgeNodeData;
}

interface CollectionsResponse {
  collections?: KnowledgeCollectionSummary[];
}

export const KnowledgeNodeConfig = memo(function KnowledgeNodeConfig({
  data,
}: KnowledgeNodeConfigProps) {
  const t = useTranslations();
  const { updateNodeData } = useReactFlow<UINode>();
  const nodes = useNodes() as UINode[];
  const edges = useEdges();
  const editable = useWorkflowStore((state) => {
    return (
      state.processIds.length === 0 &&
      state.hasEditAccess &&
      !state.workflow?.isPublished
    );
  });

  const { data: collectionsData } = useSWR<CollectionsResponse>(
    "/api/knowledge/collections",
    fetcher,
    { revalidateOnFocus: false },
  );
  const collections = collectionsData?.collections ?? [];

  const handleCollectionChange = useCallback(
    (collectionId: string) => {
      updateNodeData(data.id, { collectionId });
    },
    [data.id, updateNodeData],
  );

  const handleTopKChange = useCallback(
    (value: string) => {
      const topK = Number(value);
      updateNodeData(data.id, {
        topK: Number.isFinite(topK) ? topK : undefined,
      });
    },
    [data.id, updateNodeData],
  );

  const handleQueryChange = useCallback(
    (query: TipTapMentionJsonContent) => {
      updateNodeData(data.id, { query });
    },
    [data.id, updateNodeData],
  );

  return (
    <div className="flex flex-col gap-4 text-sm px-4 ">
      <div className="flex flex-col gap-2">
        <Label className="text-sm">{t("Workflow.knowledgeCollection")}</Label>
        <Select
          value={data.collectionId ?? ""}
          onValueChange={handleCollectionChange}
          disabled={!editable}
        >
          <SelectTrigger className="w-full">
            <SelectValue
              placeholder={t("Workflow.knowledgeCollectionPlaceholder")}
            />
          </SelectTrigger>
          <SelectContent>
            {collections.map((collection) => (
              <SelectItem key={collection.id} value={collection.id}>
                {collection.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-sm">{t("Workflow.knowledgeTopK")}</Label>
        <Input
          type="number"
          min={1}
          max={20}
          value={data.topK ?? 6}
          onChange={(e) => handleTopKChange(e.target.value)}
          disabled={!editable}
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label className="text-sm mt-1">{t("Workflow.knowledgeQuery")}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-1 hover:bg-secondary rounded cursor-pointer">
                <InfoIcon className="size-3" />
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="left"
              align="center"
              className="p-4 whitespace-pre-wrap"
            >
              {t("Workflow.kindsDescription.knowledge")}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="w-full bg-secondary rounded-md p-2">
          <OutputSchemaMentionInput
            className="min-h-48"
            currentNodeId={data.id}
            nodes={nodes}
            edges={edges}
            content={data.query}
            onChange={handleQueryChange}
            editable={editable}
          />
        </div>
      </div>
    </div>
  );
});
