export enum AppDefaultToolkit {
  Visualization = "visualization",
  WebSearch = "webSearch",
  Http = "http",
  Code = "code",
}

export enum DefaultToolName {
  CreatePieChart = "createPieChart",
  CreateBarChart = "createBarChart",
  CreateLineChart = "createLineChart",
  CreateTable = "createTable",
  WebSearch = "webSearch",
  WebContent = "webContent",
  Http = "http",
  JavascriptExecution = "mini-javascript-execution",
  PythonExecution = "python-execution",
}

export const SequentialThinkingToolName = "sequential-thinking";

// Agent Platform #19 — NL workflow generation ("Cowork-lite").
// Registered per-request in loadAppDefaultTools (it needs the session userId
// to own the draft), not in the static APP_DEFAULT_TOOL_KIT.
export const GenerateWorkflowToolName = "generateWorkflow";

export const ImageToolName = "image-manager";
