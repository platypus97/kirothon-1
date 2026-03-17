import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import type {
  SlackUrlVerification,
  SlackAppMentionEvent,
} from "../types/index";
import { handleMentionEvent } from "../services/bedrock-agent-service";
import { parseAgentResponse, formatAnalysisResult } from "../services/analysis-formatter";
import { sendBlockKitMessage, sendThreadMessage } from "../utils/slack-messenger";

export interface ExtractedEventData {
  channel: string;
  threadTs: string;
  text: string;
}

/**
 * Extracts channel, threadTs, and text from a Slack app_mention event payload.
 * Returns null if required fields (channel or threadTs) are missing.
 */
export function extractEventData(
  payload: SlackAppMentionEvent
): ExtractedEventData | null {
  const event = payload.event;

  if (!event) {
    console.error("Missing event field in payload");
    return null;
  }

  const channel = event.channel;
  const threadTs = event.thread_ts ?? event.ts;
  const text = event.text ?? "";

  if (!channel) {
    console.error("Missing channel ID in app_mention event");
    return null;
  }

  if (!threadTs) {
    console.error("Missing thread_ts/ts in app_mention event");
    return null;
  }

  return { channel, threadTs, text };
}

/**
 * Lambda handler for Slack Events API.
 * Handles url_verification challenges and app_mention events.
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  let body: Record<string, unknown>;

  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    console.error("Failed to parse request body");
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  // Handle url_verification challenge
  if (body.type === "url_verification") {
    const verification = body as unknown as SlackUrlVerification;
    return {
      statusCode: 200,
      body: JSON.stringify({ challenge: verification.challenge }),
    };
  }

  // Handle event_callback (app_mention)
  if (body.type === "event_callback") {
    const payload = body as unknown as SlackAppMentionEvent;

    const eventData = extractEventData(payload);

    if (!eventData) {
      // Missing channel or threadTs — ignore request, already logged in extractEventData
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true }),
      };
    }

    console.log("Received app_mention event", {
      channel: eventData.channel,
      threadTs: eventData.threadTs,
      textLength: eventData.text.length,
    });

    // Fire-and-forget async processing for Slack's 3-second ACK requirement
    processAnalysis(eventData).catch((error) => {
      console.error("[MentionReceiver] Unhandled error in async processing", { error });
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    };
  }

  // Unknown event type
  console.error("Unknown event type", { type: body.type });
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true }),
  };
}

/**
 * Async processing pipeline:
 * 1. handleMentionEvent → parse Sentry alert + invoke Bedrock Agent
 * 2. parseAgentResponse → convert agent text to AnalysisResult
 * 3. formatAnalysisResult → convert to Slack Block Kit blocks
 * 4. sendBlockKitMessage → post to Slack thread
 */
async function processAnalysis(eventData: ExtractedEventData): Promise<void> {
  const { channel, threadTs, text } = eventData;

  try {
    // Step 1: Parse message + invoke Bedrock Agent
    const agentResponse = await handleMentionEvent(channel, threadTs, text);

    if (!agentResponse) {
      // handleMentionEvent already sent an appropriate message to the thread
      console.log("[MentionReceiver] No agent response (URL missing or agent failed)", { channel, threadTs });
      return;
    }

    // Step 2: Parse agent response into structured result
    const analysisResult = parseAgentResponse(agentResponse);

    // Step 3: Format as Block Kit blocks
    const blocks = formatAnalysisResult(analysisResult);

    // Step 4: Send to Slack thread
    await sendBlockKitMessage(channel, threadTs, blocks);

    console.log("[MentionReceiver] Analysis complete", { channel, threadTs });
  } catch (error) {
    console.error("[MentionReceiver] Error during analysis pipeline", { channel, threadTs, error });
    await sendThreadMessage(
      channel,
      threadTs,
      "⚠️ 분석 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    );
  }
}
