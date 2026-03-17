import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import type { BedrockAgentInput } from "../types/index";
import { parseSentryAlert } from "../parsers/sentry-message-parser";
import { sendThreadMessage } from "../utils/slack-messenger";

let client: BedrockAgentRuntimeClient | null = null;

function getClient(): BedrockAgentRuntimeClient {
  if (!client) {
    client = new BedrockAgentRuntimeClient({});
  }
  return client;
}

/** Visible for testing – allows injecting a mock client. */
export function _setBedrockClient(
  c: BedrockAgentRuntimeClient | null,
): void {
  client = c;
}

/**
 * Invoke the Bedrock Agent for analysis.
 * Sends a "분석을 시작합니다..." status message first, then calls the agent.
 * Returns the agent's response text, or null on failure.
 */
export async function invokeAnalysisAgent(
  input: BedrockAgentInput,
): Promise<string | null> {
  // Send status message
  await sendThreadMessage(
    input.slackChannelId,
    input.slackThreadTs,
    "🔍 분석을 시작합니다...",
  );

  try {
    const agentClient = getClient();
    const agentId = process.env.BEDROCK_AGENT_ID;
    const agentAliasId = process.env.BEDROCK_AGENT_ALIAS_ID;

    if (!agentId || !agentAliasId) {
      throw new Error(
        "BEDROCK_AGENT_ID or BEDROCK_AGENT_ALIAS_ID environment variable is not set",
      );
    }

    const prompt = [
      `문제 URL: ${input.problemUrl}`,
      `오류 유형: ${input.errorType}`,
      `오류 메시지: ${input.errorMessage}`,
    ].join("\n");

    const command = new InvokeAgentCommand({
      agentId,
      agentAliasId,
      sessionId: `${input.slackChannelId}-${input.slackThreadTs}`,
      inputText: prompt,
    });

    const response = await agentClient.send(command);

    // Collect streamed completion chunks
    let resultText = "";
    if (response.completion) {
      for await (const event of response.completion) {
        if (event.chunk?.bytes) {
          resultText += new TextDecoder().decode(event.chunk.bytes);
        }
      }
    }

    return resultText || null;
  } catch (error) {
    console.error("[BedrockAgentService] Failed to invoke agent", { error });
    await sendThreadMessage(
      input.slackChannelId,
      input.slackThreadTs,
      "⚠️ 분석 에이전트 호출에 실패했습니다. 잠시 후 다시 시도해주세요.",
    );
    return null;
  }
}

/**
 * Orchestrates the mention event flow:
 * 1. Parse the Sentry alert message
 * 2. If no problem URL, send guidance message and return
 * 3. Build BedrockAgentInput and invoke the analysis agent
 */
export async function handleMentionEvent(
  channel: string,
  threadTs: string,
  messageText: string,
): Promise<string | null> {
  const parsed = parseSentryAlert(messageText);

  if (!parsed.problemUrl) {
    await sendThreadMessage(
      channel,
      threadTs,
      "Sentry 알림에서 문제 URL 정보를 찾을 수 없습니다.",
    );
    return null;
  }

  const input: BedrockAgentInput = {
    problemUrl: parsed.problemUrl,
    errorType: parsed.errorType ?? "Unknown",
    errorMessage: parsed.errorMessage ?? "No error message",
    slackChannelId: channel,
    slackThreadTs: threadTs,
  };

  return invokeAnalysisAgent(input);
}
