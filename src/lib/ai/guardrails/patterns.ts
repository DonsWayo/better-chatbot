/**
 * Regex patterns for PII and secret detection.
 * Biased toward EU/Spanish data types (A Safe's jurisdiction).
 */

export interface Pattern {
  id: string;
  label: string;
  regex: RegExp;
  mask: string; // replacement token when redacting
}

// ── PII patterns ─────────────────────────────────────────────────────────────

export const PII_PATTERNS: Pattern[] = [
  {
    id: "email",
    label: "email address",
    regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    mask: "[EMAIL]",
  },
  {
    id: "phone_es",
    label: "Spanish phone number",
    regex: /(?<!\d)(\+34[-.\s]?)?[67]\d{2}[-.\s]?\d{3}[-.\s]?\d{3}(?!\d)/g,
    mask: "[PHONE]",
  },
  {
    id: "phone_intl",
    label: "international phone",
    regex: /\+(?:[0-9] ?){6,14}[0-9]\b/g,
    mask: "[PHONE]",
  },
  {
    id: "nif_nie",
    label: "Spanish NIF/NIE",
    // NIF: 8 digits + letter. NIE: X/Y/Z + 7 digits + letter
    regex: /\b(?:[XYZ]\d{7}|[0-9]{8})[A-Z]\b/g,
    mask: "[ID-ES]",
  },
  {
    id: "iban",
    label: "IBAN",
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}(?:[A-Z0-9]?){0,16}\b/g,
    mask: "[IBAN]",
  },
  {
    id: "card",
    label: "credit/debit card",
    // Visa/MC/Amex/etc — 13-19 digits with optional spaces/dashes
    regex: /\b(?:\d[ -]?){13,19}\b/g,
    mask: "[CARD]",
  },
  {
    id: "ip_v4",
    label: "IPv4 address",
    regex:
      /\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}\b/g,
    mask: "[IP]",
  },
  {
    id: "passport",
    label: "passport/document number",
    // Spanish: 3 letters + 6 digits, EU general: 2 letters + 7 digits
    regex: /\b(?:[A-Z]{2,3}\d{6,7})\b/g,
    mask: "[DOC-ID]",
  },
];

// ── Secret / credential patterns ─────────────────────────────────────────────

export const SECRET_PATTERNS: Pattern[] = [
  {
    id: "openai_key",
    label: "OpenAI API key",
    regex: /\bsk-[A-Za-z0-9_\-]{20,}\b/g,
    mask: "[SECRET:OPENAI_KEY]",
  },
  {
    id: "openrouter_key",
    label: "OpenRouter API key",
    regex: /\bsk-or-[A-Za-z0-9_\-]{20,}\b/g,
    mask: "[SECRET:OPENROUTER_KEY]",
  },
  {
    id: "aws_access_key",
    label: "AWS access key",
    regex: /\b(?:AKIA|ASIA|AROA|AIDA)[A-Z0-9]{16}\b/g,
    mask: "[SECRET:AWS_KEY]",
  },
  {
    id: "aws_secret",
    label: "AWS secret key",
    regex:
      /(?:aws_secret_access_key|AWS_SECRET)[^=\n]*=\s*([A-Za-z0-9+/]{40})/gi,
    mask: "[SECRET:AWS_SECRET]",
  },
  {
    id: "private_key_block",
    label: "PEM private key",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    mask: "[SECRET:PRIVATE_KEY]",
  },
  {
    id: "env_password",
    label: "password in env-var style",
    // Negative lookbehind prevents matching inside previously-inserted [SECRET:...] markers
    regex:
      /(?<!\[)(?:password|passwd|secret|token|api_key|apikey)\s*[:=]\s*\S+/gi,
    mask: "[SECRET:CREDENTIAL]",
  },
  {
    id: "jwt_token",
    label: "JWT token",
    regex:
      /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g,
    mask: "[SECRET:JWT]",
  },
  {
    id: "bearer_token",
    label: "Bearer token",
    regex: /\bBearer\s+[A-Za-z0-9._~+\/\-]{20,}\b/g,
    mask: "[SECRET:BEARER]",
  },
];

// ── EU AI Act: employment-decision guardrail (Art. 26 / high-risk boundary) ──
// This tool must NOT be used for automated hiring, firing, or performance-grading
// decisions. These patterns flag such use; action=block under any policy.

export const EMPLOYMENT_DECISION_PATTERNS: Pattern[] = [
  {
    id: "hiring_decision",
    label: "automated hiring decision",
    regex:
      /(?:should|must|will|decide|recommend)\s+(?:we\s+)?(?:hire|not\s+hire|reject|shortlist|select)\s+(?:this\s+)?(?:candidate|applicant|person)/gi,
    mask: "[BLOCKED:EMPLOYMENT_DECISION]",
  },
  {
    id: "performance_grade",
    label: "automated performance grading",
    regex:
      /(?:rate|grade|score|rank|evaluate|assess)\s+(?:this\s+)?(?:employee|worker|staff)\s+(?:and\s+)?(?:decide|determine|give|assign)\s+(?:their\s+)?(?:performance|rating|grade|score|review)/gi,
    mask: "[BLOCKED:EMPLOYMENT_DECISION]",
  },
  {
    id: "disciplinary_decision",
    label: "automated disciplinary decision",
    regex:
      /(?:should|must|decide|recommend)\s+(?:we\s+)?(?:fire|dismiss|terminate|discipline|warn|sanction)\s+(?:this\s+)?(?:employee|worker|staff|person)/gi,
    mask: "[BLOCKED:EMPLOYMENT_DECISION]",
  },
];

// ── Prompt injection heuristics ──────────────────────────────────────────────

export const INJECTION_PATTERNS: Pattern[] = [
  {
    id: "ignore_instructions",
    label: "ignore instructions injection",
    regex:
      /ignore\s+(?:all\s+)?(?:previous|prior|above|preceding)\s+instructions?/gi,
    mask: "[BLOCKED:INJECTION]",
  },
  {
    id: "you_are_now",
    label: "role override injection",
    regex:
      /you\s+are\s+(?:now|a|an)\s+(?:unrestricted|jailbroken|evil|dan|worm|virus|hacker|attacker)/gi,
    mask: "[BLOCKED:INJECTION]",
  },
  {
    id: "system_prompt_leak",
    label: "system prompt extraction attempt",
    regex:
      /(?:reveal|repeat|show|print|output|display|tell me|give me|what(?:'s|\s+is))\s+(?:your\s+)?(?:system\s+prompt|instructions?|rules?|guidelines?|initial prompt)/gi,
    mask: "[BLOCKED:SYS_LEAK]",
  },
  {
    id: "base64_injection",
    label: "obfuscated base64 injection",
    // Suspiciously long base64 strings in prompts (possible encoded instructions)
    regex: /(?:[A-Za-z0-9+/]{50,}={0,2})\s*(?:decode|base64|atob)/gi,
    mask: "[BLOCKED:OBFUSCATION]",
  },
  {
    id: "disregard_instructions",
    label: "disregard/forget instructions injection",
    regex:
      /(?:disregard|forget|override)\s+(?:all\s+)?(?:previous|prior|above|preceding|your|earlier)\s+(?:instructions?|rules?|guidelines?|directives?)/gi,
    mask: "[BLOCKED:INJECTION]",
  },
  {
    id: "fake_system_tag",
    label: "fake system/instruction tag",
    // Injected pseudo-markup pretending to open a system / instruction scope
    regex:
      /<\/?system[^>]*>|\[\/?(?:SYSTEM|INST)\]|\bnew\s+system\s+(?:prompt|instructions?|message)\s*:/gi,
    mask: "[BLOCKED:FAKE_SYSTEM]",
  },
  {
    id: "tool_redirection",
    label: "tool redirection injection",
    // Instructions that try to steer the model's tool use toward exfiltration
    regex:
      /(?:use|call|invoke|run)\s+(?:the\s+)?[\w.\-]+\s+tool\s+(?:to|and)\s+(?:send|post|forward|upload|email|exfiltrate|transmit)/gi,
    mask: "[BLOCKED:TOOL_REDIRECT]",
  },
  {
    id: "data_exfiltration",
    label: "data exfiltration instruction",
    regex:
      /(?:send|forward|post|upload|email|exfiltrate|transmit)\s+(?:all\s+|the\s+)?(?:conversation|chat\s+history|messages?|credentials?|secrets?|api\s+keys?|system\s+prompt|user\s+data)\s+to\b/gi,
    mask: "[BLOCKED:EXFIL]",
  },
  {
    id: "covert_instruction",
    label: "covert instruction (hide from user)",
    regex:
      /do\s+not\s+(?:tell|inform|alert|notify|mention\s+(?:this\s+)?to|reveal\s+(?:this\s+)?to)\s+the\s+user/gi,
    mask: "[BLOCKED:COVERT]",
  },
];
