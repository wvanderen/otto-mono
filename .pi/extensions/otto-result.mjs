export const RESULT_PREFIX = "OTTO_RESULT";

export const shortText = (text, max = 120) => {
  const squashed = text.replace(/\s+/g, " ").trim();
  if (squashed.length <= max) return squashed;
  return `${squashed.slice(0, max - 3)}...`;
};

export const classifyAction = (assistantText) => {
  const text = assistantText.toLowerCase();
  if (text.includes("review") || text.includes("approve")) return "review";
  if (text.includes("implement") || text.includes("in_progress")) {
    return "implementation";
  }
  if (text.includes("validate-prd") || text.includes("requirements trace")) {
    return "requirements-validation";
  }
  if (
    text.includes("epic") ||
    text.includes("create-story") ||
    text.includes("code-review")
  ) {
    return "epic-workflow";
  }
  return "unknown";
};

export const classifyOutcome = (assistantText) => {
  const text = assistantText.toLowerCase();
  if (
    text.includes("no reviewable") ||
    text.includes("no ready") ||
    text.includes("no open issues") ||
    text.includes("no follow-up td work remains")
  ) {
    return "no-work";
  }
  if (
    text.includes("blocked") ||
    text.includes("waiting on") ||
    text.includes("unable to")
  ) {
    return "blocked";
  }
  if (
    text.includes("ask one targeted question") ||
    text.includes("need your direction") ||
    text.includes("wait for user direction")
  ) {
    return "needs-input";
  }
  if (text.includes("error") || text.includes("failed")) return "failed";
  if (text.length > 0) return "completed";
  return "unknown";
};

export const parseIssueId = (text) => {
  const match = text.match(/\btd-[a-z0-9]+\b/i);
  return match ? match[0] : null;
};

export const parseIssueTitle = (text, issueId = parseIssueId(text)) => {
  if (!issueId) return null;

  const escapedIssueId = issueId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `\\b${escapedIssueId}\\b\\s*[\\u2014\\u2013:-]\\s*([^\\n.]+)`,
      "i",
    ),
    new RegExp(`\\b${escapedIssueId}\\b\\s+[\"']([^\"']+)[\"']`, "i"),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate) return shortText(candidate, 120);
  }

  return null;
};

export const parseWorkflowResult = (assistantText) => {
  const matches = [
    ...assistantText.matchAll(
      new RegExp(`^${RESULT_PREFIX}\\s+(\\{.*\\})$`, "gm"),
    ),
  ];
  if (matches.length === 0) return { result: null, malformed: false };

  const payload = matches[matches.length - 1]?.[1];
  if (!payload) return { result: null, malformed: true };

  try {
    const parsed = JSON.parse(payload);
    if (!parsed || typeof parsed !== "object") {
      return { result: null, malformed: true };
    }

    const action =
      parsed.action === "review" ||
      parsed.action === "implementation" ||
      parsed.action === "requirements-validation" ||
      parsed.action === "epic-workflow"
        ? parsed.action
        : "unknown";
    const outcome =
      parsed.outcome === "completed" ||
      parsed.outcome === "blocked" ||
      parsed.outcome === "needs-input" ||
      parsed.outcome === "no-work" ||
      parsed.outcome === "failed"
        ? parsed.outcome
        : "unknown";
    const confidence =
      parsed.confidence === "high" ||
      parsed.confidence === "medium" ||
      parsed.confidence === "low"
        ? parsed.confidence
        : "unknown";
    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim().length > 0
        ? shortText(parsed.summary, 160)
        : "No structured summary.";
    const issueId =
      typeof parsed.issueId === "string" &&
      /\btd-[a-z0-9]+\b/i.test(parsed.issueId)
        ? (parsed.issueId.match(/\btd-[a-z0-9]+\b/i)?.[0] ?? null)
        : null;
    const issueTitle =
      typeof parsed.issueTitle === "string" &&
      parsed.issueTitle.trim().length > 0
        ? shortText(parsed.issueTitle, 120)
        : null;
    const token =
      typeof parsed.token === "string" && parsed.token.trim().length > 0
        ? parsed.token.trim()
        : null;

    if (
      typeof parsed.command !== "string" ||
      parsed.command.trim().length === 0
    ) {
      return { result: null, malformed: true };
    }

    if (!token) {
      return { result: null, malformed: true };
    }

    return {
      result: {
        command: parsed.command,
        token,
        action,
        issueId,
        issueTitle,
        outcome,
        confidence,
        summary,
      },
      malformed: false,
    };
  } catch {
    return { result: null, malformed: true };
  }
};

const PLACEHOLDER_SUCCESS_PATTERN =
  /\b(?:still placeholder-heavy|placeholder-heavy delivery|placeholder success|placeholder (?:ui|backend|service|api|flow|integration|implementation|delivery)|mock(?:ed)? success|mock(?:ed)? (?:backend|service|api|data|ui|flow|integration|implementation)|simulat(?:ed|ion) success|simulat(?:ed|ion) (?:backend|service|api|data|ui|flow|integration)|synthetic success|synthetic (?:backend|service|api|data|ui|flow|integration)|stub(?:bed)? success|stub(?:bed)? (?:backend|service|api|data|ui|flow|integration|implementation)|fake success|fake (?:backend|service|api|data|ui|flow|integration)|artifact-only success|scaffold-heavy delivery|demo-only delivery|product core is still missing|core loop not real yet)\b/gi;

const DETECTOR_DESCRIPTION_TERMS =
  /\b(?:detect(?:ion|or)?|heuristics?|patterns?|regex|checks?|logic|support|handling|guard(?:s)?|carveout(?:s)?)\b/i;

const IMPLEMENTATION_DESCRIPTION_TERMS =
  /\b(?:add(?:ed|ing)?|implement(?:ed|ing)?|restore(?:d|ing)?|tighten(?:ed|ing)?|preserv(?:ed|ing)?|improv(?:ed|ing)?|extend(?:ed|ing)?|introduc(?:ed|ing)?|describ(?:ed|ing)?)\b/i;

const isDetectorDescriptionContext = (text, start, end) => {
  const window = text.slice(
    Math.max(0, start - 48),
    Math.min(text.length, end + 48),
  );
  return (
    DETECTOR_DESCRIPTION_TERMS.test(window) &&
    IMPLEMENTATION_DESCRIPTION_TERMS.test(window)
  );
};

const hasPlaceholderSuccessEvidence = (text) => {
  for (const match of text.matchAll(PLACEHOLDER_SUCCESS_PATTERN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (!isDetectorDescriptionContext(text, start, end)) {
      return true;
    }
  }

  return false;
};

const EVIDENCE_PATTERNS = [
  {
    signal: "placeholder-success",
    alert: "placeholder success",
    matches: hasPlaceholderSuccessEvidence,
  },
  {
    signal: "runtime-gap",
    alert: "weak evidence",
    pattern:
      /\b(?:weak evidence|low confidence|runtime (?:proof|truth|evidence) (?:is )?weak|missing runtime evidence|no runtime evidence|artifact-only success|product core is still missing|core loop not real yet)\b/i,
  },
  {
    signal: "prd-gap",
    alert: "prd gap follow-up",
    pattern:
      /\b(?:prd gap|requirements? (?:gap|missing|partial)|follow-up td work|gap task|gap tasks|reopen(?:ed)? .*gap|create td tasks? for .*gap)\b/i,
  },
  {
    signal: "result-drift",
    alert: "result drift",
    pattern:
      /\b(?:false completion|workflow completion diverges|workflow result drift|td drift(?!\s+(?:handling|detection|detector|policy|policies|checks?|heuristics?|logic|support))|diverges? from (?:actual )?(?:prd|product truth)|product truth.*drift)\b/i,
  },
];

const downgradeConfidence = (confidence, severe) => {
  if (severe) return "low";
  if (confidence === "high") return "medium";
  if (confidence === "unknown") return "medium";
  return confidence;
};

export const inspectEvidence = (
  assistantText,
  workflowResult = null,
  evidencePolicy = "balanced",
) => {
  const text = assistantText || "";
  const inferredOutcome = workflowResult?.outcome ?? classifyOutcome(text);
  const completedLike =
    inferredOutcome === "completed" || inferredOutcome === "no-work";
  const signals = [];
  const alerts = [];

  for (const candidate of EVIDENCE_PATTERNS) {
    const matched = candidate.matches
      ? candidate.matches(text)
      : candidate.pattern.test(text);
    if (!matched) continue;
    signals.push(candidate.signal);
    alerts.push(candidate.alert);
  }

  const uniqueSignals = [...new Set(signals)];
  const severe =
    uniqueSignals.includes("placeholder-success") ||
    uniqueSignals.includes("result-drift") ||
    uniqueSignals.includes("runtime-gap");
  const confidence = workflowResult?.confidence ?? "unknown";

  const shouldValidate =
    completedLike &&
    (evidencePolicy === "strict"
      ? uniqueSignals.length > 0
      : evidencePolicy === "relaxed"
        ? uniqueSignals.includes("placeholder-success") ||
          uniqueSignals.includes("result-drift")
        : uniqueSignals.includes("placeholder-success") ||
          uniqueSignals.includes("runtime-gap") ||
          uniqueSignals.includes("prd-gap") ||
          uniqueSignals.includes("result-drift"));

  return {
    signals: uniqueSignals,
    alert: alerts[0] ?? null,
    completedLike,
    shouldValidate,
    effectiveConfidence: uniqueSignals.length
      ? downgradeConfidence(confidence, severe)
      : confidence,
  };
};

export const resolveWorkflowResult = (
  assistantText,
  completedCommand,
  expectedToken = null,
) => {
  const parsedWorkflowResult = parseWorkflowResult(assistantText);

  if (parsedWorkflowResult.malformed) {
    return {
      result: null,
      resultSource: "malformed",
      error: "Malformed OTTO_RESULT payload.",
      summary: shortText(assistantText || "No assistant summary."),
    };
  }

  if (parsedWorkflowResult.result) {
    if (parsedWorkflowResult.result.command !== completedCommand) {
      return {
        result: null,
        resultSource: "mismatched",
        error: `OTTO_RESULT command mismatch: expected ${completedCommand}, got ${parsedWorkflowResult.result.command}.`,
        summary: parsedWorkflowResult.result.summary,
      };
    }

    if (
      expectedToken &&
      parsedWorkflowResult.result.token &&
      parsedWorkflowResult.result.token !== expectedToken
    ) {
      return {
        result: null,
        resultSource: "mismatched",
        error: `OTTO_RESULT token mismatch: expected ${expectedToken}, got ${parsedWorkflowResult.result.token}.`,
        summary: parsedWorkflowResult.result.summary,
      };
    }

    return {
      result: parsedWorkflowResult.result,
      resultSource: "structured",
      error: null,
      summary: parsedWorkflowResult.result.summary,
    };
  }

  return {
    result: null,
    resultSource: "heuristic",
    error: null,
    summary: shortText(assistantText || "No assistant summary."),
  };
};
