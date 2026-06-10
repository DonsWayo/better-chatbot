"use client";

import { memo, useCallback, useMemo, useState } from "react";

import { Separator } from "@/components/ui/separator";

import { UINode } from "lib/ai/workflow/workflow.interface";

import {
  AlignHorizontalSpaceAround,
  Building2,
  Loader,
  Lock,
  PlayIcon,
  UserPlus,
  Users as UsersIcon,
} from "lucide-react";
import { Button } from "ui/button";

import equal from "lib/equal";

import {
  VisibilityField,
  type VisibilityValue,
  fromLegacyVisibilityColumn,
  toLegacyVisibilityColumn,
} from "@/components/visibility";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

import { DBWorkflow } from "app-types/workflow";

import { useReactFlow } from "@xyflow/react";
import { arrangeNodes } from "lib/ai/workflow/arrange-nodes";
import { allNodeValidate } from "lib/ai/workflow/node-validate";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { mutate } from "swr";
import { safe } from "ts-safe";
import { handleErrorWithToast } from "ui/shared-toast";
import { EditWorkflowPopup } from "./edit-workflow-popup";
import { ExecuteTab } from "./node-config/execute-tab";
import { SelectedNodeConfigTab } from "./selected-node-config-tab";

export const WorkflowPanel = memo(
  function WorkflowPanel({
    selectedNode,
    isProcessing,
    onSave,
    workflow,
    addProcess,
    hasEditAccess,
  }: {
    selectedNode?: UINode;
    onSave: () => Promise<void>;
    isProcessing: boolean;
    workflow: DBWorkflow;
    addProcess: () => () => void;
    hasEditAccess?: boolean;
  }) {
    const { setNodes, getNodes, getEdges } = useReactFlow();
    const [showExecutePanel, setShowExecutePanel] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const t = useTranslations();

    const handleArrangeNodes = useCallback(() => {
      const nodes = getNodes() as UINode[];
      const edges = getEdges();

      const { nodes: arrangedNodes } = arrangeNodes(nodes, edges);

      setNodes(arrangedNodes);
      toast.success(t("Workflow.nodesArranged"));
    }, [getNodes, getEdges, setNodes, t]);
    // Modern four-level visibility for the picker, seeded from the stored
    // column (literal since migration 0041; legacy "public"/"readonly" rows
    // are mapped) + teamIds (unified visibility model — see
    // docs/design/visibility-model.md).
    const visibilityValue = useMemo<VisibilityValue>(
      () => ({
        visibility: fromLegacyVisibilityColumn(
          workflow.visibility,
          workflow.teamIds,
        ),
        teamIds: workflow.teamIds ?? [],
      }),
      [workflow.visibility, workflow.teamIds],
    );

    const updateVisibility = useCallback(
      (next: VisibilityValue) => {
        setIsSaving(true);
        const close = addProcess();
        safe(() =>
          fetch(`/api/workflow/${workflow.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              // Persist the literal four-level value (identity mapping since
              // migration 0041 widened the column); teamIds carries the
              // "team"-level membership signal.
              visibility: toLegacyVisibilityColumn(next.visibility),
              teamIds: next.teamIds,
            }),
          }).then((res) => {
            if (res.status != 200) throw new Error(res.statusText);
          }),
        )
          .ifOk(() => mutate(`/api/workflow/${workflow.id}`))
          .ifFail((e) => handleErrorWithToast(e))
          .watch(() => {
            setIsSaving(false);
            close();
          });
      },
      [workflow.id, addProcess],
    );

    const updatePublished = useCallback(
      (isPublished: boolean) => {
        if (isPublished) {
          const validateResult = allNodeValidate({
            nodes: getNodes() as UINode[],
            edges: getEdges(),
          });

          if (validateResult !== true) {
            if (validateResult.node) {
              setNodes((nds) => {
                return nds.map((node) => {
                  if (node.id === validateResult.node?.id) {
                    return { ...node, selected: true };
                  }
                  if (node.selected) {
                    return { ...node, selected: false };
                  }
                  return node;
                });
              });
            }
            return toast.warning(validateResult.errorMessage);
          }
        }

        const close = addProcess();
        safe(() => onSave())
          .ifOk(() =>
            fetch(`/api/workflow/${workflow.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                isPublished,
              }),
            }).then((res) => {
              if (res.status != 200) throw new Error(res.statusText);
            }),
          )
          .ifOk(() => mutate(`/api/workflow/${workflow.id}`))
          .ifFail((e) => handleErrorWithToast(e))
          .watch(close);
      },
      [workflow],
    );

    const handleWorkflowMasterSave = useCallback((workflow: DBWorkflow) => {
      mutate(`/api/workflow/${workflow.id}`);
      setIsEditing(false);
    }, []);

    return (
      <div className="min-h-0 flex flex-col items-end">
        <div className="flex items-center gap-2 mb-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                style={{
                  backgroundColor: workflow.icon?.style?.backgroundColor,
                }}
                onClick={() => setIsEditing(true)}
                className="border transition-colors hover:bg-secondary! group items-center justify-center flex w-8 h-8 rounded-md ring ring-background hover:ring-ring"
              >
                <Avatar className="size-6">
                  <AvatarImage
                    src={workflow.icon?.value}
                    className="group-hover:scale-110  transition-transform"
                  />
                  <AvatarFallback></AvatarFallback>
                </Avatar>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{workflow?.name}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                disabled={isProcessing || !hasEditAccess}
                onClick={handleArrangeNodes}
              >
                <AlignHorizontalSpaceAround className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{t("Workflow.arrangeNodes")}</p>
            </TooltipContent>
          </Tooltip>
          <div className="h-6">
            <Separator orientation="vertical" />
          </div>
          <Button
            variant="secondary"
            disabled={isProcessing}
            onClick={() => {
              setNodes((nds) => {
                return nds.map((node) => {
                  if (node.selected) {
                    return { ...node, selected: false };
                  }
                  return node;
                });
              });
              setShowExecutePanel(!showExecutePanel);
            }}
          >
            <PlayIcon />
            {t("Common.run")}
          </Button>

          {!workflow.isPublished && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled={isProcessing || !hasEditAccess}
                  onClick={onSave}
                  variant="default"
                >
                  {isProcessing ? (
                    <Loader className="size-3.5 animate-spin" />
                  ) : (
                    t("Common.save")
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("Workflow.autoSaveDescription")}
              </TooltipContent>
            </Tooltip>
          )}
          <div className="h-6">
            <Separator orientation="vertical" />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={"secondary"}
                disabled={isProcessing || !hasEditAccess}
                onClick={() => updatePublished(!workflow.isPublished)}
                className="w-20"
              >
                {workflow.isPublished
                  ? t("Common.edit")
                  : t("Workflow.publish")}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" className="w-60 text-sm">
              <p className="whitespace-pre-wrap break-words p-4">
                {workflow.isPublished
                  ? t("Workflow.publishedDescription")
                  : t("Workflow.draftDescription")}
              </p>
            </TooltipContent>
          </Tooltip>
          <WorkflowVisibilityControl
            workflowId={workflow.id}
            value={visibilityValue}
            onChange={updateVisibility}
            canEdit={hasEditAccess || false}
            saving={isSaving}
          />
        </div>
        <div className="flex gap-2">
          {selectedNode && <SelectedNodeConfigTab node={selectedNode} />}
          {showExecutePanel && (
            <ExecuteTab
              close={() => {
                if (isProcessing) return;
                setShowExecutePanel(false);
              }}
              onSave={onSave}
            />
          )}
        </div>
        <EditWorkflowPopup
          open={isEditing}
          onOpenChange={setIsEditing}
          defaultValue={workflow}
          onSave={handleWorkflowMasterSave}
        />
      </div>
    );
  },
  (prev, next) => {
    if (prev.isProcessing !== next.isProcessing) {
      return false;
    }
    if (Boolean(prev.selectedNode) !== Boolean(next.selectedNode)) {
      return false;
    }
    if (prev.hasEditAccess !== next.hasEditAccess) {
      return false;
    }
    if (!equal(prev.selectedNode?.data, next.selectedNode?.data)) {
      return false;
    }

    if (!equal(prev.workflow, next.workflow)) return false;
    return true;
  },
);

const VISIBILITY_TRIGGER_ICON = {
  private: Lock,
  shared: UserPlus,
  team: UsersIcon,
  company: Building2,
} as const;

/**
 * Popover trigger that opens the unified VisibilityPicker for a workflow. The
 * picker emits the four-level value; the panel maps it onto the legacy column
 * + teamIds on change.
 */
function WorkflowVisibilityControl({
  workflowId,
  value,
  onChange,
  canEdit,
  saving,
}: {
  workflowId: string;
  value: VisibilityValue;
  onChange: (value: VisibilityValue) => void;
  canEdit: boolean;
  saving: boolean;
}) {
  const t = useTranslations();
  const Icon = VISIBILITY_TRIGGER_ICON[value.visibility];
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={saving}
              className="size-8 text-muted-foreground hover:text-foreground data-[state=open]:bg-input"
              data-testid="workflow-visibility-button"
            >
              {saving ? (
                <Loader className="size-4 animate-spin" />
              ) : (
                <Icon className="size-4" />
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("Visibility.label")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 rounded-2xl p-3">
        <p className="mb-2 px-1 text-sm font-medium">{t("Visibility.label")}</p>
        <VisibilityField
          value={value}
          onChange={onChange}
          disabled={!canEdit || saving}
          entity={{ type: "workflow", id: workflowId }}
        />
      </PopoverContent>
    </Popover>
  );
}
