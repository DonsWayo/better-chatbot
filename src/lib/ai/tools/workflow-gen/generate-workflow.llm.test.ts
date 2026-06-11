import { generateObject } from "ai";
import { describe, expect, it, vi } from "vitest";

// Opt-in real-LLM tier (RUN_LLM_TESTS=1 pnpm test:llm) — see vitest.llm.config.ts.
const RUN = Boolean(
  process.env.OPENROUTER_API_KEY && process.env.RUN_LLM_TESTS === "1",
);

// Same db/persistence mocks as generate-workflow.test.ts — only the model is real.
vi.mock("lib/db/repository", () => ({
  workflowRepository: {
    save: vi.fn(),
    saveStructure: vi.fn(),
  },
}));
vi.mock("lib/agent-platform/revisions", () => ({
  createDraftRevision: vi.fn(),
}));

import { createDraftRevision } from "lib/agent-platform/revisions";
import { customModelProvider } from "lib/ai/models";
import { workflowRepository } from "lib/db/repository";
import {
  GenerateWorkflowResult,
  createGenerateWorkflowTool,
  generateWorkflowInputSchema,
  generateWorkflowToolDescription,
} from "./generate-workflow";

const mockSave = vi.mocked(workflowRepository.save);
const mockSaveStructure = vi.mocked(workflowRepository.saveStructure);
const mockCreateDraftRevision = vi.mocked(createDraftRevision);

describe.skipIf(!RUN)(
  "generate-workflow with a real cheap model (deepseek-v4-flash)",
  () => {
    it(
      'a real model drafts a valid "check that safeguru.com is up" workflow',
      { timeout: 30_000 },
      async () => {
        // Real structured generation against the tool's actual zod input schema
        // (incl. the slugify transform and weak-model JSON-string coercions).
        const { object } = await generateObject({
          model: customModelProvider.getModel({
            provider: "openRouter",
            model: "deepseek-v4-flash",
          }),
          schema: generateWorkflowInputSchema,
          system: generateWorkflowToolDescription,
          prompt: [
            "Generate a workflow that checks that safeguru.com is up.",
            "Use exactly three nodes: one input node, one http node doing a GET",
            'request to "https://safeguru.com", and one output node whose',
            'outputData reads the http node output at path ["response","body"].',
            "Connect them with edges input -> http -> output.",
          ].join(" "),
          maxOutputTokens: 2_000,
        });

        // Schema robustness: slugified name + structural minimums.
        expect(object.name).toMatch(/^[a-zA-Z0-9-]+$/);
        const inputNodes = object.nodes.filter((n) => n.kind === "input");
        const outputNodes = object.nodes.filter((n) => n.kind === "output");
        expect(inputNodes).toHaveLength(1);
        expect(outputNodes.length).toBeGreaterThanOrEqual(1);
        expect(object.edges.length).toBeGreaterThanOrEqual(2);

        // Now run the tool's execute path (db mocked) with the model's draft.
        mockSave.mockResolvedValue({
          id: "wf-llm-1",
          name: object.name,
          version: "0.1.0",
          isPublished: false,
          visibility: "private",
          userId: "user-llm-test",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        mockSaveStructure.mockResolvedValue(undefined);
        mockCreateDraftRevision.mockResolvedValue({
          id: "rev-llm-1",
        } as unknown as Awaited<ReturnType<typeof createDraftRevision>>);

        const tool = createGenerateWorkflowTool({ userId: "user-llm-test" });
        const result = (await tool.execute!(object, {
          toolCallId: "call-llm-1",
          messages: [],
        })) as GenerateWorkflowResult;

        expect(
          result.ok,
          `draft should pass builder validation, got: ${JSON.stringify(result)}`,
        ).toBe(true);
        if (result.ok) {
          expect(result.workflowId).toBe("wf-llm-1");
          expect(result.nodeCount).toBe(object.nodes.length);
        }
        expect(mockSave).toHaveBeenCalledWith(
          expect.objectContaining({
            name: object.name,
            visibility: "private",
            isPublished: false,
            userId: "user-llm-test",
          }),
          true,
        );
      },
    );
  },
);
