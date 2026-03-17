import type { ParsedSentryAlert } from "../types/index";

/**
 * Checks if a URL belongs to the Sentry domain (*.sentry.io).
 */
export function isSentryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /(?:^|\.)sentry\.io$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Extracts all URLs from message text, filters out Sentry domain URLs,
 * and returns the first non-Sentry URL (the problem URL).
 * Returns null if no non-Sentry URL is found.
 */
export function extractProblemUrl(messageText: string): string | null {
  const urlRegex = /https?:\/\/[^\s<>|]+/gi;
  const urls = messageText.match(urlRegex) ?? [];

  // Strip trailing punctuation that may have been captured (e.g. trailing >, |, ))
  const cleaned = urls.map((u) => u.replace(/[>|)]+$/, ""));

  const nonSentryUrls = cleaned.filter((url) => !isSentryUrl(url));
  return nonSentryUrls.length > 0 ? nonSentryUrls[0] : null;
}

/**
 * Parses a Sentry alert message and extracts the problem URL, error type,
 * and error message. Returns a ParsedSentryAlert object.
 */
export function parseSentryAlert(messageText: string): ParsedSentryAlert {
  const problemUrl = extractProblemUrl(messageText);

  // Extract error type: common patterns like "TypeError", "ReferenceError",
  // "500 Internal Server Error", etc.
  const errorType = extractErrorType(messageText);

  // Extract error message: text following the error type or quoted error description
  const errorMessage = extractErrorMessage(messageText);

  return {
    problemUrl,
    errorType,
    errorMessage,
    rawText: messageText,
  };
}

/**
 * Extracts error type from message text using common patterns.
 */
function extractErrorType(text: string): string | null {
  // Match common JS/Python error types (e.g. TypeError, ValueError, HttpError)
  const errorTypeRegex = /\b([A-Z][a-zA-Z]*(?:Error|Exception|Fault))\b/;
  const match = text.match(errorTypeRegex);
  if (match) return match[1];

  // Match HTTP status error patterns (e.g. "500 Internal Server Error", "404 Not Found")
  // Capture status code + words until we hit a preposition, URL, punctuation, or end
  const httpErrorRegex = /\b([45]\d{2}(?:\s+[A-Z][a-z]+)+)/;
  const httpMatch = text.match(httpErrorRegex);
  if (httpMatch) return httpMatch[1].trim();

  return null;
}

/**
 * Extracts error message from message text.
 * Looks for quoted strings or text after common delimiters.
 */
function extractErrorMessage(text: string): string | null {
  // Match text in quotes (single or double) — often the error message
  const quotedRegex = /["']([^"']{5,})["']/;
  const quotedMatch = text.match(quotedRegex);
  if (quotedMatch) return quotedMatch[1];

  // Match text after "Error:" or "Exception:" or "Message:" patterns
  const afterColonRegex = /(?:error|exception|message)\s*:\s*(.+?)(?:\n|$)/i;
  const colonMatch = text.match(afterColonRegex);
  if (colonMatch) return colonMatch[1].trim();

  return null;
}
