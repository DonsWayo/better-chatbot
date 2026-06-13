import { VercelAIMcpTool } from "app-types/mcp";
import { getSession } from "auth/server";
import {
  buildMcpServerCustomizationsSystemPrompt,
  buildSpeechSystemPrompt,
} from "lib/ai/prompts";
import { NextRequest } from "next/server";
import {
  filterMcpServerCustomizations,
  loadMcpTools,
  mergeSystemPrompt,
} from "../shared.chat";

import { ChatMention } from "app-types/chat";
import { colorize } from "consola/utils";
import { DEFAULT_VOICE_TOOLS } from "lib/ai/speech";
import globalLogger from "lib/logger";
import { getUserPreferences } from "lib/user/server";
import { safe } from "ts-safe";
import {
  rememberAgentAction,
  rememberMcpServerCustomizationsAction,
} from "../actions";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `OpenAI Realtime API: `),
});

export async function POST(request: NextRequest) {
  try {
    // Auth and entitlement checks must run before any deployment-config
    // checks so callers get accurate 401/403 responses first.
    const session = await getSession();

    if (!session?.user.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    // AUP hard gate (EU AI Act Art. 50): voice chat runs inference, so a user
    // who never accepted the AUP is blocked before any provider session opens.
    const { aupGateResponse } = await import("lib/compliance/aup");
    const aupGate = await aupGateResponse(session.user.id);
    if (aupGate) return aupGate;

    // W9 feature toggle, enforced server-side like allowVision (default-deny,
    // enabled per team in /admin). Found unenforced by the wave audit.
    const { getTeamPolicy, getUserPrimaryTeamId } = await import(
      "lib/admin/teams"
    );
    const teamId = await getUserPrimaryTeamId(session.user.id);
    const teamPolicy = teamId ? await getTeamPolicy(teamId) : null;
    if (!teamPolicy?.allowSpeech) {
      return new Response(
        JSON.stringify({
          error: "Voice chat is not enabled for your team.",
        }),
        { status: 403 },
      );
    }

    // Entitled user but the deployment has no OpenAI key: service unavailable,
    // not a server error.
    if (!process.env.OPENAI_API_KEY) {
      logger.error("OPENAI_API_KEY is not set; voice chat unavailable");
      return Response.json(
        {
          error: "voice_not_configured",
          message: "Voice is not available on this deployment.",
        },
        { status: 503 },
      );
    }

    const { voice, mentions, agentId } = (await request.json()) as {
      model: string;
      voice: string;
      agentId?: string;
      mentions: ChatMention[];
    };

    const agent = await rememberAgentAction(agentId, session.user.id);

    agentId && logger.info(`[${agentId}] Agent: ${agent?.name}`);

    const enabledMentions = agent ? agent.instructions.mentions : mentions;

    const allowedMcpTools = await loadMcpTools({ mentions: enabledMentions });

    const toolNames = Object.keys(allowedMcpTools ?? {});

    if (toolNames.length > 0) {
      logger.info(`${toolNames.length} tools found`);
    } else {
      logger.info(`No tools found`);
    }

    const userPreferences = await getUserPreferences(session.user.id);

    const mcpServerCustomizations = await safe()
      .map(() => {
        if (Object.keys(allowedMcpTools ?? {}).length === 0)
          throw new Error("No tools found");
        return rememberMcpServerCustomizationsAction(session.user.id);
      })
      .map((v) => filterMcpServerCustomizations(allowedMcpTools!, v))
      .orElse({});

    const openAITools = Object.entries(allowedMcpTools ?? {}).map(
      ([name, tool]) => {
        return vercelAIToolToOpenAITool(tool, name);
      },
    );

    const systemPrompt = mergeSystemPrompt(
      buildSpeechSystemPrompt(
        session.user,
        userPreferences ?? undefined,
        agent,
      ),
      buildMcpServerCustomizationsSystemPrompt(mcpServerCustomizations),
    );

    const bindingTools = [...openAITools, ...DEFAULT_VOICE_TOOLS];

    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        model: "gpt-4o-realtime-preview",
        voice: voice || "alloy",
        input_audio_transcription: {
          model: "whisper-1",
        },
        instructions: systemPrompt,
        tools: bindingTools,
      }),
    });

    return new Response(r.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
}

function vercelAIToolToOpenAITool(tool: VercelAIMcpTool, name: string) {
  return {
    name,
    type: "function",
    description: tool.description,
    parameters: (tool.inputSchema as any).jsonSchema ?? {
      type: "object",
      properties: {},
      required: [],
    },
  };
}
