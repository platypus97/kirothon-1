import { describe, it, expect } from "vitest";
import { formatAnalysisResult, parseAgentResponse } from "./analysis-formatter";
import type { AnalysisResult } from "../types/index";

// ---------------------------------------------------------------------------
// formatAnalysisResult
// ---------------------------------------------------------------------------
describe("formatAnalysisResult", () => {
  const baseResult: AnalysisResult = {
    errorSummary: "NullPointerException in UserService",
    estimatedCause: "user 객체가 null인 상태에서 접근",
    relatedCodeLocation: "src/services/UserService.java:42",
    impactScope: "로그인 API 전체 영향",
    recommendedActions: "null 체크 추가 후 배포",
    dataCollectionNotes: [],
    isPartialResult: false,
  };

  it("should include header block as first block", () => {
    const blocks = formatAnalysisResult(baseResult);
    expect(blocks[0]).toEqual({
      type: "header",
      text: { type: "plain_text", text: "🔍 장애 분석 결과" },
    });
  });

  it("should include all 5 required section blocks", () => {
    const blocks = formatAnalysisResult(baseResult);
    const sectionTexts = blocks
      .filter((b) => b.type === "section")
      .map((b) => b.text!.text);

    expect(sectionTexts).toContainEqual(expect.stringContaining("*오류 요약*"));
    expect(sectionTexts).toContainEqual(expect.stringContaining("*추정 원인*"));
    expect(sectionTexts).toContainEqual(expect.stringContaining("*관련 코드 위치*"));
    expect(sectionTexts).toContainEqual(expect.stringContaining("*영향 범위*"));
    expect(sectionTexts).toContainEqual(expect.stringContaining("*권장 대응 방안*"));
  });

  it("should include section content in the blocks", () => {
    const blocks = formatAnalysisResult(baseResult);
    const sectionTexts = blocks
      .filter((b) => b.type === "section")
      .map((b) => b.text!.text);

    expect(sectionTexts).toContainEqual(
      expect.stringContaining("NullPointerException in UserService"),
    );
  });

  it("should NOT include context blocks when no partial result and no notes", () => {
    const blocks = formatAnalysisResult(baseResult);
    const contextBlocks = blocks.filter((b) => b.type === "context");
    expect(contextBlocks).toHaveLength(0);
  });

  it("should include partial result context block when isPartialResult is true", () => {
    const partial: AnalysisResult = { ...baseResult, isPartialResult: true };
    const blocks = formatAnalysisResult(partial);
    const contextBlocks = blocks.filter((b) => b.type === "context");

    expect(contextBlocks.length).toBeGreaterThanOrEqual(1);
    const texts = contextBlocks.flatMap((b) =>
      (b.elements ?? []).map((e) => e.text),
    );
    expect(texts.some((t) => t.includes("부분 분석 결과"))).toBe(true);
  });

  it("should include dataCollectionNotes as context blocks", () => {
    const withNotes: AnalysisResult = {
      ...baseResult,
      dataCollectionNotes: [
        "Sentry 데이터 수집 실패",
        "CloudWatch 데이터 수집 실패",
      ],
    };
    const blocks = formatAnalysisResult(withNotes);
    const contextBlocks = blocks.filter((b) => b.type === "context");

    expect(contextBlocks.length).toBeGreaterThanOrEqual(2);
    const texts = contextBlocks.flatMap((b) =>
      (b.elements ?? []).map((e) => e.text),
    );
    expect(texts.some((t) => t.includes("Sentry 데이터 수집 실패"))).toBe(true);
    expect(texts.some((t) => t.includes("CloudWatch 데이터 수집 실패"))).toBe(true);
  });

  it("should include both partial notice and notes when both present", () => {
    const both: AnalysisResult = {
      ...baseResult,
      isPartialResult: true,
      dataCollectionNotes: ["소스코드 수집 실패"],
    };
    const blocks = formatAnalysisResult(both);
    const contextBlocks = blocks.filter((b) => b.type === "context");
    // 1 partial notice + 1 note
    expect(contextBlocks).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// parseAgentResponse
// ---------------------------------------------------------------------------
describe("parseAgentResponse", () => {
  it("should parse a well-structured agent response", () => {
    const text = [
      "오류 요약: NullPointerException 발생",
      "추정 원인: user 객체 null 참조",
      "관련 코드 위치: UserService.java:42",
      "영향 범위: 로그인 API",
      "권장 대응 방안: null 체크 추가",
    ].join("\n");

    const result = parseAgentResponse(text);
    expect(result.errorSummary).toContain("NullPointerException");
    expect(result.estimatedCause).toContain("null 참조");
    expect(result.relatedCodeLocation).toContain("UserService.java");
    expect(result.impactScope).toContain("로그인");
    expect(result.recommendedActions).toContain("null 체크");
  });

  it("should handle markdown-style headers (## 오류 요약)", () => {
    const text = [
      "## 오류 요약",
      "서버 500 에러",
      "## 추정 원인",
      "DB 연결 실패",
      "## 관련 코드 위치",
      "db-pool.ts:15",
      "## 영향 범위",
      "전체 API",
      "## 권장 대응 방안",
      "DB 연결 풀 재설정",
    ].join("\n");

    const result = parseAgentResponse(text);
    expect(result.errorSummary).toContain("서버 500 에러");
    expect(result.estimatedCause).toContain("DB 연결 실패");
  });

  it("should fallback to errorSummary when no sections found", () => {
    const text = "Something went wrong, here is the full analysis text.";
    const result = parseAgentResponse(text);
    expect(result.errorSummary).toBe(text);
    expect(result.estimatedCause).toBe("");
  });

  it("should handle empty response", () => {
    const result = parseAgentResponse("");
    expect(result.errorSummary).toContain("분석 결과를 받지 못했습니다");
  });

  it("should detect partial result indicators", () => {
    const text = [
      "오류 요약: 에러 발생",
      "추정 원인: 알 수 없음",
      "관련 코드 위치: 확인 불가",
      "영향 범위: 전체",
      "권장 대응 방안: 추가 조사 필요",
      "⚠️ Sentry 데이터 수집 실패",
    ].join("\n");

    const result = parseAgentResponse(text);
    expect(result.isPartialResult).toBe(true);
    expect(result.dataCollectionNotes).toContain("Sentry 데이터 수집 실패");
  });

  it("should extract multiple data collection notes", () => {
    const text = [
      "오류 요약: 에러",
      "추정 원인: 원인",
      "관련 코드 위치: 위치",
      "영향 범위: 범위",
      "권장 대응 방안: 방안",
      "⚠️ Sentry 데이터 수집 실패",
      "⚠️ CloudWatch 데이터 수집 실패",
    ].join("\n");

    const result = parseAgentResponse(text);
    expect(result.dataCollectionNotes).toHaveLength(2);
    expect(result.isPartialResult).toBe(true);
  });
});
