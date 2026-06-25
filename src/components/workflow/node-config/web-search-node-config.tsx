"use client";

import { useEdges, useNodes, useReactFlow } from "@xyflow/react";
import { WebSearchNodeData, UINode } from "lib/ai/workflow/workflow.interface";
import { memo, useCallback } from "react";
import { Input } from "ui/input";
import { Label } from "ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import { InfoIcon } from "lucide-react";
import { TipTapMentionJsonContent } from "app-types/util";
import { useWorkflowStore } from "@/app/store/workflow.store";
import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";
import { OutputSchemaMentionInput } from "../output-schema-mention-input";

interface WebSearchNodeConfigProps {
  data: WebSearchNodeData;
}

export const WebSearchNodeConfig = memo(function WebSearchNodeConfig({
  data,
}: WebSearchNodeConfigProps) {
  const t = useTranslations();
  const kindsDescription = t.raw("Workflow.kindsDescription") as Record<string, string>;
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

  const handleQueryChange = useCallback(
    (query: TipTapMentionJsonContent) => {
      updateNodeData(data.id, { query });
    },
    [data.id, updateNodeData],
  );

  const handleNumResultsChange = useCallback(
    (value: string) => {
      const num = Number(value);
      updateNodeData(data.id, {
        numResults: Number.isFinite(num) ? Math.max(1, Math.min(20, num)) : 5,
      });
    },
    [data.id, updateNodeData],
  );

  const handleTypeChange = useCallback(
    (value: string) => {
      updateNodeData(data.id, {
        type: value as WebSearchNodeData["type"],
      });
    },
    [data.id, updateNodeData],
  );

  return (
    <div className="flex flex-col gap-4 text-sm px-4">
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-sm">{t("Workflow.webSearchQuery")}</Label>
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
              {kindsDescription["web-search"]}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="w-full bg-secondary rounded-md p-2">
          <OutputSchemaMentionInput
            className="min-h-24"
            currentNodeId={data.id}
            nodes={nodes}
            edges={edges}
            content={data.query}
            onChange={handleQueryChange}
            editable={editable}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-sm">{t("Workflow.webSearchNumResults")}</Label>
        <Input
          type="number"
          min={1}
          max={20}
          value={data.numResults ?? 5}
          onChange={(e) => handleNumResultsChange(e.target.value)}
          disabled={!editable}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-sm">{t("Workflow.webSearchType")}</Label>
        <Select
          value={data.type ?? "auto"}
          onValueChange={handleTypeChange}
          disabled={!editable}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="keyword">Keyword</SelectItem>
            <SelectItem value="neural">Neural (semantic)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
});
