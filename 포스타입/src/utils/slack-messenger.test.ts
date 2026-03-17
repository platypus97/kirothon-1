import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendThreadMessage,
  sendBlockKitMessage,
  _setSlackClient,
} from "./slack-messenger";
import type { SlackBlock } from "../types";

function createMockClient(postMessageFn: (...args: any[]) => any) {
  return { chat: { postMessage: postMessageFn } } as any;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  _setSlackClient(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("sendThreadMessage", () => {
  it("sends a text message to the correct thread", async () => {
    const postMessage = vi.fn().mockResolvedValue({ ok: true });
    _setSlackClient(createMockClient(postMessage));

    await sendThreadMessage("C123", "1234567890.123456", "hello");

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith({
      channel: "C123",
      thread_ts: "1234567890.123456",
      text: "hello",
    });
  });

  it("retries with exponential backoff on failure then succeeds", async () => {
    const postMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: true });
    _setSlackClient(createMockClient(postMessage));

    const promise = sendThreadMessage("C1", "ts1", "hi");

    // First call fails immediately, then waits 1000ms before retry
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it("logs to console.error after 3 failed attempts", async () => {
    const postMessage = vi.fn().mockRejectedValue(new Error("fail"));
    _setSlackClient(createMockClient(postMessage));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const promise = sendThreadMessage("C1", "ts1", "hi");

    // advance through backoff delays: 1s after 1st fail, 2s after 2nd fail
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(postMessage).toHaveBeenCalledTimes(3);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[SlackMessenger] Failed to send thread message after retries",
      expect.objectContaining({ channel: "C1", threadTs: "ts1" }),
    );
  });
});

describe("sendBlockKitMessage", () => {
  it("sends Block Kit blocks to the correct thread", async () => {
    const postMessage = vi.fn().mockResolvedValue({ ok: true });
    _setSlackClient(createMockClient(postMessage));

    const blocks: SlackBlock[] = [
      { type: "section", text: { type: "mrkdwn", text: "test" } },
    ];

    await sendBlockKitMessage("C456", "ts456", blocks);

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C456",
        thread_ts: "ts456",
        blocks,
        text: "분석 결과",
      }),
    );
  });

  it("retries with exponential backoff on failure then succeeds", async () => {
    const postMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error("rate_limited"))
      .mockRejectedValueOnce(new Error("rate_limited"))
      .mockResolvedValueOnce({ ok: true });
    _setSlackClient(createMockClient(postMessage));

    const promise = sendBlockKitMessage("C1", "ts1", []);

    // 1st fail → wait 1s, 2nd fail → wait 2s, 3rd succeeds
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(postMessage).toHaveBeenCalledTimes(3);
  });

  it("logs to console.error after 3 failed attempts", async () => {
    const postMessage = vi.fn().mockRejectedValue(new Error("fail"));
    _setSlackClient(createMockClient(postMessage));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const promise = sendBlockKitMessage("C1", "ts1", []);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(postMessage).toHaveBeenCalledTimes(3);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[SlackMessenger] Failed to send Block Kit message after retries",
      expect.objectContaining({ channel: "C1", threadTs: "ts1" }),
    );
  });
});

describe("lazy WebClient initialization", () => {
  it("throws when SLACK_BOT_TOKEN is not set", async () => {
    _setSlackClient(null);
    delete process.env.SLACK_BOT_TOKEN;

    await expect(
      sendThreadMessage("C1", "ts1", "hi"),
    ).rejects.toThrow("SLACK_BOT_TOKEN environment variable is not set");
  });
});
