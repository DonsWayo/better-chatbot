import { beforeEach, describe, expect, it, vi } from "vitest";

// Repositories + scheduler are mocked (vi.hoisted pattern, like
// src/lib/admin/model-policy.test.ts); the graph-building helpers run for
// real so the tests also validate the generated INPUT → LLM → OUTPUT graph.

const h = vi.hoisted(() => {
  const agentRepository = {
    selectAgentsByUserId: vi.fn(),
    insertAgent: vi.fn(),
  };
  const workflowRepository = {
    selectByUserId: vi.fn(),
    save: vi.fn(),
    saveStructure: vi.fn(),
  };
  const scheduler = {
    createSchedule: vi.fn(),
    setScheduleEnabled: vi.fn(),
    listSchedulesForUser: vi.fn(),
  };
  return { agentRepository, workflowRepository, scheduler };
});

vi.mock("server-only", () => ({}));

vi.mock("lib/db/repository", () => ({
  agentRepository: h.agentRepository,
  workflowRepository: h.workflowRepository,
}));

vi.mock("lib/agent-platform/scheduler", () => ({
  createSchedule: h.scheduler.createSchedule,
  setScheduleEnabled: h.scheduler.setScheduleEnabled,
  listSchedulesForUser: h.scheduler.listSchedulesForUser,
}));

import {
  buildPackWorkflowGraph,
  getRolePackStatus,
  installRolePack,
} from "./install";
import { ROLE_PACKS, getRolePack } from "./packs";

const ADMIN = "admin-user-1";
const sales = getRolePack("sales")!;

beforeEach(() => {
  vi.clearAllMocks();
  h.agentRepository.selectAgentsByUserId.mockResolvedValue([]);
  h.agentRepository.insertAgent.mockImplementation(async (agent) => ({
    ...agent,
    id: `agent-${agent.name}`,
  }));
  h.workflowRepository.selectByUserId.mockResolvedValue([]);
  h.workflowRepository.save.mockImplementation(async (workflow) => ({
    ...workflow,
    id: "wf-1",
  }));
  h.workflowRepository.saveStructure.mockResolvedValue(undefined);
  h.scheduler.listSchedulesForUser.mockResolvedValue([]);
  h.scheduler.createSchedule.mockResolvedValue({ id: "sched-1" });
  h.scheduler.setScheduleEnabled.mockResolvedValue({
    id: "sched-1",
    enabled: false,
  });
});

describe("installRolePack", () => {
  it("rejects an unknown pack id", async () => {
    await expect(installRolePack("nope", ADMIN)).rejects.toThrow(
      "Unknown role pack: nope",
    );
  });

  it("fresh install creates 3 agents, the workflow with structure, and a disabled schedule", async () => {
    const result = await installRolePack("sales", ADMIN);

    expect(result.skipped).toEqual([]);
    expect(result.created).toEqual([
      "agent:Proposal Drafter",
      "agent:Competitor Brief",
      "agent:RFP Answerer",
      "workflow:lead-to-qualified-brief",
      "schedule:Pipeline digest",
    ]);

    // Agents: company-visible, owned by the admin, real prompts attached.
    expect(h.agentRepository.insertAgent).toHaveBeenCalledTimes(3);
    for (const call of h.agentRepository.insertAgent.mock.calls) {
      expect(call[0]).toMatchObject({
        userId: ADMIN,
        visibility: "company",
      });
      expect(call[0].instructions.systemPrompt.length).toBeGreaterThan(100);
    }

    // Workflow: published + company, structure saved with 3 nodes / 2 edges.
    expect(h.workflowRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "lead-to-qualified-brief",
        visibility: "company",
        isPublished: true,
        userId: ADMIN,
      }),
      true,
    );
    const structure = h.workflowRepository.saveStructure.mock.calls[0][0];
    expect(structure.workflowId).toBe("wf-1");
    expect(structure.nodes.map((n: { kind: string }) => n.kind)).toEqual([
      "input",
      "llm",
      "output",
    ]);
    expect(structure.edges).toHaveLength(2);

    // Schedule: weekly Monday 08:00, then immediately disabled.
    expect(h.scheduler.createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf-1",
        cronExpr: "0 8 * * 1",
        timezone: "Europe/London",
        createdBy: ADMIN,
      }),
    );
    expect(h.scheduler.setScheduleEnabled).toHaveBeenCalledWith(
      "sched-1",
      false,
    );
  });

  it("is idempotent: a second run skips every item and writes nothing", async () => {
    h.agentRepository.selectAgentsByUserId.mockResolvedValue(
      sales.agents.map((a, i) => ({ id: `a-${i}`, name: a.name })),
    );
    h.workflowRepository.selectByUserId.mockResolvedValue([
      { id: "wf-existing", name: sales.workflow.name },
    ]);
    h.scheduler.listSchedulesForUser.mockResolvedValue([
      { id: "sched-existing", workflowId: "wf-existing" },
    ]);

    const result = await installRolePack("sales", ADMIN);

    expect(result.created).toEqual([]);
    expect(result.skipped).toHaveLength(5);
    expect(h.agentRepository.insertAgent).not.toHaveBeenCalled();
    expect(h.workflowRepository.save).not.toHaveBeenCalled();
    expect(h.workflowRepository.saveStructure).not.toHaveBeenCalled();
    expect(h.scheduler.createSchedule).not.toHaveBeenCalled();
  });

  it("fills in only the missing pieces after a partial install", async () => {
    // Workflow already exists, schedule does not: only the schedule (and
    // missing agents) are created, attached to the existing workflow id.
    h.agentRepository.selectAgentsByUserId.mockResolvedValue([
      { id: "a-0", name: "Proposal Drafter" },
    ]);
    h.workflowRepository.selectByUserId.mockResolvedValue([
      { id: "wf-existing", name: sales.workflow.name },
    ]);

    const result = await installRolePack("sales", ADMIN);

    expect(result.skipped).toEqual([
      "agent:Proposal Drafter",
      "workflow:lead-to-qualified-brief",
    ]);
    expect(result.created).toEqual([
      "agent:Competitor Brief",
      "agent:RFP Answerer",
      "schedule:Pipeline digest",
    ]);
    expect(h.workflowRepository.save).not.toHaveBeenCalled();
    expect(h.scheduler.createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: "wf-existing" }),
    );
    expect(h.scheduler.setScheduleEnabled).toHaveBeenCalledWith(
      "sched-1",
      false,
    );
  });

  it("installs the manufacturing-ops pack with its daily 06:30 schedule", async () => {
    const result = await installRolePack("manufacturing-ops", ADMIN);

    expect(result.created).toContain("workflow:production-exceptions-report");
    expect(h.scheduler.createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ cronExpr: "30 6 * * *" }),
    );
  });
});

describe("buildPackWorkflowGraph", () => {
  it.each(ROLE_PACKS.map((p) => [p.id, p] as const))(
    "builds a valid INPUT → LLM → OUTPUT graph for %s",
    (_id, pack) => {
      const graph = buildPackWorkflowGraph(pack.workflow);

      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges).toHaveLength(2);

      const [input, llm, output] = graph.nodes;
      // Input exposes the pack's fields.
      expect(Object.keys(input.data.outputSchema.properties ?? {})).toEqual(
        Object.keys(pack.workflow.inputFields),
      );
      // LLM message contains the prompt and a mention of each input field.
      const message = JSON.stringify(llm.data);
      expect(message).toContain(input.id);
      for (const field of Object.keys(pack.workflow.inputFields)) {
        expect(message).toContain(`\\"path\\":[\\"${field}\\"]`);
      }
      // Output maps the LLM answer to the pack's output key.
      expect((output.data as { outputData: unknown[] }).outputData).toEqual([
        {
          key: pack.workflow.outputKey,
          source: { nodeId: llm.id, path: ["answer"] },
        },
      ]);
    },
  );
});

describe("getRolePackStatus", () => {
  it("reports not installed when nothing exists", async () => {
    const status = await getRolePackStatus("sales", ADMIN);
    expect(status.installed).toBe(false);
    expect(status.items).toHaveLength(5);
    expect(status.items.every((i) => !i.installed)).toBe(true);
  });

  it("reports installed when every item exists for the owner", async () => {
    h.agentRepository.selectAgentsByUserId.mockResolvedValue(
      sales.agents.map((a, i) => ({ id: `a-${i}`, name: a.name })),
    );
    h.workflowRepository.selectByUserId.mockResolvedValue([
      { id: "wf-existing", name: sales.workflow.name },
    ]);
    h.scheduler.listSchedulesForUser.mockResolvedValue([
      { id: "s-1", workflowId: "wf-existing" },
    ]);

    const status = await getRolePackStatus("sales", ADMIN);
    expect(status.installed).toBe(true);
    expect(status.items.every((i) => i.installed)).toBe(true);
  });

  it("marks the schedule missing when only the workflow exists", async () => {
    h.workflowRepository.selectByUserId.mockResolvedValue([
      { id: "wf-existing", name: sales.workflow.name },
    ]);

    const status = await getRolePackStatus("sales", ADMIN);
    expect(status.installed).toBe(false);
    expect(status.items.find((i) => i.kind === "workflow")?.installed).toBe(
      true,
    );
    expect(status.items.find((i) => i.kind === "schedule")?.installed).toBe(
      false,
    );
  });
});
