import assert from "node:assert/strict";

import {
  classifyAction,
  classifyOutcome,
  inspectEvidence,
  parseIssueId,
  parseIssueTitle,
  parseWorkflowResult,
  resolveWorkflowResult,
  shortText,
} from "../packages/otto/src/otto-result.mjs";

const validText = [
  "Completed td-123abc - Current td UI should include title and queued review.",
  'OTTO_RESULT {"command":"/bmad:td:next-step","token":"otto-test-token","action":"review","issueId":"td-123abc","issueTitle":"Current td UI should include title","outcome":"completed","confidence":"high","summary":"Completed td-123abc and queued review."}',
].join("\n");

const validParsed = parseWorkflowResult(validText);
assert.equal(validParsed.malformed, false);
assert.deepEqual(validParsed.result, {
  command: "/bmad:td:next-step",
  token: "otto-test-token",
  action: "review",
  issueId: "td-123abc",
  issueTitle: "Current td UI should include title",
  outcome: "completed",
  confidence: "high",
  summary: "Completed td-123abc and queued review.",
});

const mismatched = resolveWorkflowResult(validText, "/bmad:td:validate-prd");
assert.equal(mismatched.resultSource, "mismatched");
assert.equal(mismatched.result, null);
assert.match(mismatched.error ?? "", /command mismatch/);

const mismatchedToken = resolveWorkflowResult(
  validText,
  "/bmad:td:next-step",
  "otto-other-token",
);
assert.equal(mismatchedToken.resultSource, "mismatched");
assert.equal(mismatchedToken.result, null);
assert.match(mismatchedToken.error ?? "", /token mismatch/);

const missingToken = resolveWorkflowResult(
  'OTTO_RESULT {"command":"/bmad:td:next-step","action":"review","issueId":"td-123abc","issueTitle":"Current td UI should include title","outcome":"completed","confidence":"high","summary":"Completed td-123abc and queued review."}',
  "/bmad:td:next-step",
  "otto-test-token",
);
assert.equal(missingToken.resultSource, "malformed");
assert.equal(missingToken.result, null);
assert.equal(missingToken.error, "Malformed OTTO_RESULT payload.");

const malformed = resolveWorkflowResult(
  'OTTO_RESULT {"command": }',
  "/bmad:td:next-step",
);
assert.equal(malformed.resultSource, "malformed");
assert.equal(malformed.result, null);
assert.equal(malformed.error, "Malformed OTTO_RESULT payload.");

const heuristic = resolveWorkflowResult(
  "No reviewable or ready issues remain.",
  "/bmad:td:next-step",
);
assert.equal(heuristic.resultSource, "heuristic");
assert.equal(heuristic.result, null);
assert.equal(heuristic.error, null);
assert.equal(heuristic.summary, "No reviewable or ready issues remain.");

assert.equal(classifyAction("Implement td-abc123 now."), "implementation");
assert.equal(classifyAction("Run code-review on td-abc123."), "review");
assert.equal(
  classifyOutcome("Need your direction before continuing."),
  "needs-input",
);
assert.equal(
  classifyOutcome("This task is blocked waiting on td-xyz999."),
  "blocked",
);
assert.equal(classifyOutcome("No open issues remain."), "no-work");
assert.equal(classifyOutcome("The workflow failed to continue."), "failed");
assert.deepEqual(
  inspectEvidence(
    "Workflow completed, but this is still placeholder-heavy and runtime evidence is weak. Create td gap tasks.",
    { outcome: "completed", confidence: "high" },
  ),
  {
    signals: ["placeholder-success", "runtime-gap", "prd-gap"],
    alert: "placeholder success",
    completedLike: true,
    shouldValidate: true,
    effectiveConfidence: "low",
  },
);
assert.deepEqual(
  inspectEvidence("Completed td-abc123 with strong runtime proof.", {
    outcome: "completed",
    confidence: "high",
  }),
  {
    signals: [],
    alert: null,
    completedLike: true,
    shouldValidate: false,
    effectiveConfidence: "high",
  },
);
assert.deepEqual(
  inspectEvidence(
    "Implemented placeholder and simulated-success detection for Otto.",
    { outcome: "completed", confidence: "high" },
  ),
  {
    signals: [],
    alert: null,
    completedLike: true,
    shouldValidate: false,
    effectiveConfidence: "high",
  },
);
assert.deepEqual(
  inspectEvidence("Completed with mocked backend and placeholder UI.", {
    outcome: "completed",
    confidence: "high",
  }),
  {
    signals: ["placeholder-success"],
    alert: "placeholder success",
    completedLike: true,
    shouldValidate: true,
    effectiveConfidence: "low",
  },
);
assert.deepEqual(
  inspectEvidence(
    "Completed td-7ba2f2 by adding mocked backend and placeholder UI detection.",
    { outcome: "completed", confidence: "high" },
  ),
  {
    signals: [],
    alert: null,
    completedLike: true,
    shouldValidate: false,
    effectiveConfidence: "high",
  },
);
assert.deepEqual(
  inspectEvidence(
    "Completed td-7ba2f2 by adding simulated-success detection and td drift handling.",
    { outcome: "completed", confidence: "high" },
  ),
  {
    signals: [],
    alert: null,
    completedLike: true,
    shouldValidate: false,
    effectiveConfidence: "high",
  },
);
assert.equal(parseIssueId("Focus td-abc123 then continue."), "td-abc123");
assert.equal(parseIssueId("No issue present."), null);
assert.equal(
  parseIssueTitle("Focus td-abc123 - Current td UI should include title next."),
  "Current td UI should include title next",
);
assert.equal(shortText("  hello   world  "), "hello world");

console.log("Otto result contract checks passed.");
