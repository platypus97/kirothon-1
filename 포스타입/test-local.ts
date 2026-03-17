/**
 * 로컬 E2E 테스트 스크립트
 * Slack과 Bedrock를 mock하여 전체 플로우를 확인합니다.
 *
 * 실행: npx tsx test-local.ts
 */

import { _setSlackClient } from "./src/utils/slack-messenger";
import { _setBedrockClient } from "./src/services/bedrock-agent-service";
import { handler } from "./src/handlers/mention-receiver";

// ── Mock Slack Client ──
const slackMessages: { channel: string; thread_ts: string; text?: string; blocks?: unknown }[] = [];

const mockSlackClient = {
  chat: {
    postMessage: async (args: any) => {
      slackMessages.push(args);
      console.log(`  📨 [Slack] → #${args.channel} (thread: ${args.thread_ts})`);
      if (args.text) console.log(`     text: ${args.text}`);
      if (args.blocks) console.log(`     blocks: ${args.blocks.length}개 블록`);
      return { ok: true };
    },
  },
} as any;

_setSlackClient(mockSlackClient);

// ── Mock Bedrock Client ──
// 실제 Bedrock Agent가 반환할 법한 분석 결과를 시뮬레이션
const mockAgentResponse = `오류 요약:
/api/users/123 엔드포인트에서 TypeError 발생. Cannot read properties of undefined (reading 'name') 오류로 인해 사용자 프로필 조회 실패.

추정 원인:
데이터베이스에서 조회한 사용자 객체가 null인 상태에서 name 속성에 접근 시도. 삭제된 사용자 ID로 요청이 들어온 경우 발생 가능.

관련 코드 위치:
src/controllers/userController.ts:45 - getUserProfile 함수
src/services/userService.ts:23 - findUserById 함수

영향 범위:
사용자 프로필 조회 API 전체에 영향. 분당 약 15건의 오류 발생, 약 120명의 사용자에게 영향.

권장 대응 방안:
1. userService.findUserById에서 null 체크 추가
2. 삭제된 사용자에 대한 404 응답 처리
3. Optional chaining 적용: user?.name`;

const mockBedrockClient = {
  send: async (_command: any) => {
    // 1초 딜레이로 실제 API 호출 시뮬레이션
    await new Promise((r) => setTimeout(r, 1000));
    return {
      completion: (async function* () {
        const encoder = new TextEncoder();
        yield { chunk: { bytes: encoder.encode(mockAgentResponse) } };
      })(),
    };
  },
} as any;

_setBedrockClient(mockBedrockClient);

// ── 환경변수 설정 ──
process.env.SLACK_BOT_TOKEN = "xoxb-mock-token";
process.env.BEDROCK_AGENT_ID = "mock-agent-id";
process.env.BEDROCK_AGENT_ALIAS_ID = "mock-alias-id";


// ── 테스트 시나리오 실행 ──
async function runTests() {
  console.log("=".repeat(60));
  console.log("🧪 Sentry-Slack 자동 분석 봇 로컬 테스트");
  console.log("=".repeat(60));

  // 시나리오 1: url_verification 챌린지
  console.log("\n📋 시나리오 1: Slack url_verification 챌린지");
  console.log("-".repeat(40));
  const verifyResult = await handler({
    body: JSON.stringify({
      type: "url_verification",
      token: "test",
      challenge: "challenge-abc-123",
    }),
  } as any);
  console.log(`  응답: ${verifyResult.statusCode} ${verifyResult.body}`);

  // 시나리오 2: 정상 Sentry 알림 (문제 URL 포함)
  console.log("\n📋 시나리오 2: 정상 Sentry 알림 → 전체 분석 플로우");
  console.log("-".repeat(40));
  slackMessages.length = 0;
  const mentionResult = await handler({
    body: JSON.stringify({
      type: "event_callback",
      token: "test",
      team_id: "T123",
      event: {
        type: "app_mention",
        channel: "C_ALERT_CHANNEL",
        ts: "1710000000.000001",
        text: "<@U_ANALYSIS_BOT> 🚨 *TypeError* in /api/users/123\nhttps://api.example.com/users/123\nCannot read properties of undefined (reading 'name')\nhttps://postype.sentry.io/issues/12345/",
        user: "U_SENTRY_ALERT",
      },
      event_id: "Ev001",
      event_time: 1710000000,
    }),
  } as any);
  console.log(`  ACK 응답: ${mentionResult.statusCode} ${mentionResult.body}`);

  // 비동기 처리 완료 대기
  console.log("  ⏳ 비동기 분석 처리 대기 중...");
  await new Promise((r) => setTimeout(r, 2000));
  console.log(`  ✅ Slack 메시지 ${slackMessages.length}건 전송됨`);

  // 시나리오 3: 문제 URL 없는 메시지
  console.log("\n📋 시나리오 3: 문제 URL 없는 메시지 → 안내 메시지");
  console.log("-".repeat(40));
  slackMessages.length = 0;
  await handler({
    body: JSON.stringify({
      type: "event_callback",
      token: "test",
      team_id: "T123",
      event: {
        type: "app_mention",
        channel: "C_ALERT_CHANNEL",
        ts: "1710000001.000001",
        text: "<@U_ANALYSIS_BOT> 이건 URL이 없는 메시지입니다",
        user: "U_SENTRY_ALERT",
      },
      event_id: "Ev002",
      event_time: 1710000001,
    }),
  } as any);
  await new Promise((r) => setTimeout(r, 500));
  console.log(`  ✅ Slack 메시지 ${slackMessages.length}건 전송됨`);

  // 시나리오 4: 채널 ID 누락
  console.log("\n📋 시나리오 4: 채널 ID 누락 → 무시");
  console.log("-".repeat(40));
  const noChannelResult = await handler({
    body: JSON.stringify({
      type: "event_callback",
      token: "test",
      team_id: "T123",
      event: {
        type: "app_mention",
        channel: "",
        ts: "1710000002.000001",
        text: "<@U_ANALYSIS_BOT> test",
        user: "U_SENTRY_ALERT",
      },
      event_id: "Ev003",
      event_time: 1710000002,
    }),
  } as any);
  console.log(`  응답: ${noChannelResult.statusCode} (요청 무시됨)`);

  console.log("\n" + "=".repeat(60));
  console.log("✅ 모든 시나리오 완료");
  console.log("=".repeat(60));
}

runTests().catch(console.error);
