// Slack Events API → Lambda 입력
export interface SlackEventPayload {
  token: string;
  type: "event_callback" | "url_verification";
  event: {
    type: "app_mention";
    channel: string;
    ts: string;
    thread_ts?: string;
    text: string;
    user: string;
  };
}

// Slack url_verification 챌린지 (봇 등록 시)
export interface SlackUrlVerification {
  type: "url_verification";
  token: string;
  challenge: string;
}

// Slack app_mention 이벤트
export interface SlackAppMentionEvent {
  type: "event_callback";
  token: string;
  team_id: string;
  event: {
    type: "app_mention";
    channel: string;
    ts: string;
    thread_ts?: string;
    text: string;
    user: string;
  };
  event_id: string;
  event_time: number;
}

// 파싱된 Sentry 알림 데이터
export interface ParsedSentryAlert {
  problemUrl: string | null;
  errorType: string | null;
  errorMessage: string | null;
  rawText: string;
}

// Lambda → Bedrock Agent 호출 파라미터
export interface BedrockAgentInput {
  problemUrl: string;
  errorType: string;
  errorMessage: string;
  slackChannelId: string;
  slackThreadTs: string;
}

// Bedrock Agent 입력
export interface AnalysisRequest {
  problemUrl: string;
  errorType: string;
  errorMessage: string;
  slackChannelId: string;
  slackThreadTs: string;
}

// 로그 엔트리
export interface LogEntry {
  timestamp: string;
  message: string;
  logGroup: string;
  logStream: string;
}

// 소스코드 스니펫
export interface CodeSnippet {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
}

// MCP 데이터 수집 결과
export interface CollectedData {
  sentry: {
    success: boolean;
    stackTrace?: string;
    errorDetails?: string;
    frequency?: number;
    affectedUsers?: number;
    failureReason?: string;
  };
  cloudwatch: {
    success: boolean;
    logs?: LogEntry[];
    failureReason?: string;
  };
  sourceCode: {
    success: boolean;
    snippets?: CodeSnippet[];
    failureReason?: string;
  };
}

// LLM 분석 결과
export interface AnalysisResult {
  errorSummary: string;
  estimatedCause: string;
  relatedCodeLocation: string;
  impactScope: string;
  recommendedActions: string;
  dataCollectionNotes: string[];
  isPartialResult: boolean;
}

// Slack Block Kit 블록 타입
export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
  };
  elements?: Array<{
    type: string;
    text: string;
  }>;
}

// Slack 스레드 응답
export interface SlackThreadResponse {
  channel: string;
  thread_ts: string;
  blocks: SlackBlock[];
}

// Slack 재시도 설정
export interface SlackRetryConfig {
  maxRetries: 3;
  retryDelayMs: 1000;
  backoffMultiplier: 2;
}
