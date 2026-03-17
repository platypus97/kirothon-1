import { WebClient } from "@slack/web-api";
import type { SlackBlock } from "../types";

let slackClient: WebClient | null = null;

function getSlackClient(): WebClient {
  if (!slackClient) {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
      throw new Error("SLACK_BOT_TOKEN environment variable is not set");
    }
    slackClient = new WebClient(token);
  }
  return slackClient;
}

/** Visible for testing – allows injecting a mock WebClient. */
export function _setSlackClient(client: WebClient | null): void {
  slackClient = client;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const BACKOFF_MULTIPLIER = 2;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a simple text message to a Slack thread with exponential backoff retry.
 */
export async function sendThreadMessage(
  channel: string,
  threadTs: string,
  text: string,
): Promise<void> {
  const client = getSlackClient();
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text,
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, attempt);
        await sleep(delay);
      }
    }
  }

  console.error(
    "[SlackMessenger] Failed to send thread message after retries",
    { channel, threadTs, error: lastError },
  );
}

/**
 * Send a Block Kit formatted message to a Slack thread with exponential backoff retry.
 */
export async function sendBlockKitMessage(
  channel: string,
  threadTs: string,
  blocks: SlackBlock[],
): Promise<void> {
  const client = getSlackClient();
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        blocks: blocks as any,
        text: "분석 결과",
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, attempt);
        await sleep(delay);
      }
    }
  }

  console.error(
    "[SlackMessenger] Failed to send Block Kit message after retries",
    { channel, threadTs, error: lastError },
  );
}
