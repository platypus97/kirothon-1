import type { AnalysisResult, SlackBlock } from "../types/index";

/**
 * Convert an AnalysisResult into Slack Block Kit blocks.
 *
 * Always includes:
 *  - Header block ("🔍 장애 분석 결과")
 *  - 5 required section blocks (오류 요약, 추정 원인, 관련 코드 위치, 영향 범위, 권장 대응 방안)
 *  - If isPartialResult, a context block with a partial-result notice
 *  - If dataCollectionNotes has entries, a context block per note
 */
export function formatAnalysisResult(result: AnalysisResult): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: "🔍 장애 분석 결과" },
  });

  // 5 required sections
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*오류 요약*\n${result.errorSummary}` },
  });

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*추정 원인*\n${result.estimatedCause}` },
  });

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*관련 코드 위치*\n${result.relatedCodeLocation}`,
    },
  });

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*영향 범위*\n${result.impactScope}` },
  });

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*권장 대응 방안*\n${result.recommendedActions}`,
    },
  });

  // Partial result notice
  if (result.isPartialResult) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "⚠️ 일부 데이터 소스 수집에 실패하여 부분 분석 결과입니다",
        },
      ],
    });
  }

  // Data collection failure notes
  if (result.dataCollectionNotes.length > 0) {
    for (const note of result.dataCollectionNotes) {
      blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `⚠️ ${note}` }],
      });
    }
  }

  return blocks;
}


// Section header patterns used to split the agent's text response.
// The agent is expected to produce sections like "오류 요약:", "추정 원인:", etc.
const SECTION_HEADERS: { key: keyof Pick<AnalysisResult, "errorSummary" | "estimatedCause" | "relatedCodeLocation" | "impactScope" | "recommendedActions">; patterns: string[] }[] = [
  { key: "errorSummary", patterns: ["오류 요약", "Error Summary"] },
  { key: "estimatedCause", patterns: ["추정 원인", "Estimated Cause", "Root Cause"] },
  { key: "relatedCodeLocation", patterns: ["관련 코드 위치", "Related Code", "Code Location"] },
  { key: "impactScope", patterns: ["영향 범위", "Impact Scope", "Impact"] },
  { key: "recommendedActions", patterns: ["권장 대응 방안", "Recommended Actions", "Actions"] },
];

/**
 * Parse the Bedrock Agent's text response into an AnalysisResult.
 *
 * The agent response is expected to contain sections separated by headers
 * (e.g. "오류 요약:" or "## 오류 요약"). If parsing fails, the entire
 * response is placed in errorSummary as a fallback.
 */
export function parseAgentResponse(responseText: string): AnalysisResult {
  const result: AnalysisResult = {
    errorSummary: "",
    estimatedCause: "",
    relatedCodeLocation: "",
    impactScope: "",
    recommendedActions: "",
    dataCollectionNotes: [],
    isPartialResult: false,
  };

  if (!responseText || responseText.trim().length === 0) {
    result.errorSummary = "분석 결과를 받지 못했습니다.";
    return result;
  }

  const trimmed = responseText.trim();

  // Build a regex that matches any known section header.
  // Supports formats like "오류 요약:", "## 오류 요약", "**오류 요약**", "오류 요약\n"
  const allPatterns = SECTION_HEADERS.flatMap((s) => s.patterns);
  const headerRegex = new RegExp(
    `(?:^|\\n)\\s*(?:#{1,3}\\s*|\\*{1,2})?\\s*(${allPatterns.map(escapeRegex).join("|")})\\s*(?:\\*{1,2})?\\s*:?\\s*`,
    "gi",
  );

  // Find all header positions
  const matches: { key: string; index: number; matchEnd: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRegex.exec(trimmed)) !== null) {
    const matchedLabel = m[1]!.trim();
    const section = SECTION_HEADERS.find((s) =>
      s.patterns.some((p) => p.toLowerCase() === matchedLabel.toLowerCase()),
    );
    if (section) {
      matches.push({
        key: section.key,
        index: m.index,
        matchEnd: m.index + m[0].length,
      });
    }
  }

  // If no sections found, fallback: put everything in errorSummary
  if (matches.length === 0) {
    result.errorSummary = trimmed;
    return result;
  }

  // Extract content between headers
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i]!.matchEnd;
    const end = i + 1 < matches.length ? matches[i + 1]!.index : trimmed.length;
    const content = trimmed.slice(start, end).trim();
    const key = matches[i]!.key as keyof typeof result;
    if (key in result && typeof result[key] === "string") {
      (result as Record<string, unknown>)[key] = content;
    }
  }

  // Check for partial result indicators in the text
  const partialIndicators = [
    "부분 분석",
    "부분 결과",
    "데이터 수집 실패",
    "수집에 실패",
    "partial result",
  ];
  if (partialIndicators.some((ind) => trimmed.toLowerCase().includes(ind.toLowerCase()))) {
    result.isPartialResult = true;
  }

  // Extract data collection notes (lines starting with ⚠️ or mentioning failures)
  const lines = trimmed.split("\n");
  for (const line of lines) {
    const stripped = line.trim();
    if (
      stripped.startsWith("⚠️") ||
      (stripped.includes("수집 실패") && !stripped.startsWith("*") && !stripped.startsWith("#"))
    ) {
      result.dataCollectionNotes.push(stripped.replace(/^⚠️\s*/, ""));
    }
  }

  if (result.dataCollectionNotes.length > 0) {
    result.isPartialResult = true;
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
