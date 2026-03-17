# 구현 계획: Sentry-Slack 자동 분석 시스템

## 개요

Sentry Slack 알림을 자동 감지하여 Sentry MCP 도구로 상세 정보를 수집하고, Seer AI + LLM 결합 분석 결과를 스레드에 응답하는 시스템을 단계적으로 구현한다. 각 단계는 이전 단계 위에 점진적으로 구축되며, 마지막에 전체 파이프라인을 연결한다.

## Tasks

- [ ] 1. 프로젝트 초기 설정 및 공유 타입 정의
  - [ ] 1.1 프로젝트 구조 생성 및 의존성 설치
    - `package.json` 생성 (typescript, @slack/bolt, @modelcontextprotocol/sdk, openai, yaml, vitest, fast-check 의존성)
    - `tsconfig.json` 생성
    - `src/` 디렉토리 구조 생성 (config, detector, dedup, collector, analyzer, mapper, responder, types)
    - 기존 axios 의존성 제거, @modelcontextprotocol/sdk 추가
    - _Requirements: 7.1_
  - [ ] 1.2 공유 타입 정의 (`src/types/index.ts`)
    - `SentryAlertInfo`, `DetectionResult`, `SentryErrorDetail`, `SeerAnalysisResult`, `AnalysisResult`, `RiskLevel`, `AssigneeMapping`, `ThreadResponse`, `AppConfig` 등 모든 인터페이스 정의
    - `SlackMessage`, `SlackAttachment`, `SlackAttachmentField`, `SlackAction` 타입 정의
    - `McpIssueDetailsResponse`, `McpSeerResponse` MCP 응답 타입 정의
    - _Requirements: 2.4_
  - [ ] 1.3 커밋 및 푸시

- [ ] 2. 설정 관리 모듈 구현 (`src/config/configManager.ts`)
  - [ ] 2.1 ConfigManager 구현
    - YAML 설정 파일 로드 (`config.yaml`)
    - 환경 변수에서 민감 정보(토큰, API 키) 로드
    - `sentryMcp` 설정 섹션 추가 (command, args) — Sentry 인증은 MCP 서버가 환경 변수로 처리
    - 필수 설정 누락 시 명확한 오류 메시지와 함께 종료
    - `fs.watch` 기반 설정 파일 핫 리로드
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [ ] 2.2 샘플 설정 파일 생성 (`config.example.yaml`)
    - 모든 설정 항목의 예시 값 포함 (sentryMcp 섹션 포함)
    - _Requirements: 7.1_
  - [ ]* 2.3 Property 11 속성 테스트: 설정 파일 파싱 라운드트립
    - **Property 11: 설정 파일 파싱 라운드트립**
    - 임의의 유효한 AppConfig → YAML 직렬화 → 파싱 → 원본과 동등성 검증
    - **Validates: Requirements 7.1**
  - [ ]* 2.4 Property 12 속성 테스트: 필수 설정 누락 시 오류 발생
    - **Property 12: 필수 설정 누락 시 오류 발생**
    - 임의의 필수 필드 누락 설정 → 로드 시 오류 발생 및 누락 필드 명시 검증
    - **Validates: Requirements 7.3**
  - [ ] 2.5 커밋 및 푸시

- [ ] 3. 메시지 감지 모듈 구현 (`src/detector/messageDetector.ts`)
  - [ ] 3.1 MessageDetector 구현
    - Sentry 봇 사용자 ID/이름 기반 판별
    - 메시지 구조 패턴 확인 (Short ID, "Events:", "Project:" 등)
    - Sentry 이슈 URL 패턴 확인
    - Short ID 추출 정규식: `/Short ID:\s*([A-Z0-9]+-[A-Z0-9-]+)/`
    - 프로젝트명, 이벤트 수, 영향 사용자 수, 에러 메시지 등 메타 정보 추출
    - threadTs 보존 (원본 메시지 ts 값)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1_
  - [ ]* 3.2 Property 1 속성 테스트: Sentry 알림 판별 정확성
    - **Property 1: Sentry 알림 판별 정확성**
    - 임의의 SlackMessage에 대해 Sentry 봇 ID/이름 + 구조적 패턴 존재 시에만 알림으로 판별
    - **Validates: Requirements 1.1, 1.2, 1.3**
  - [ ]* 3.3 Property 2 속성 테스트: 감지 결과의 threadTs 보존
    - **Property 2: 감지 결과의 threadTs 보존**
    - 임의의 Sentry 알림 메시지에 대해 detect 결과의 threadTs가 원본 ts와 일치
    - **Validates: Requirements 1.4**
  - [ ]* 3.4 Property 3 속성 테스트: Short ID 및 메타 정보 추출 정확성
    - **Property 3: Short ID 및 메타 정보 추출 정확성**
    - 임의의 Sentry 알림 메시지에서 추출된 Short ID, 프로젝트명, 이벤트 수 등이 원본과 일치
    - **Validates: Requirements 2.1**
  - [ ] 3.5 커밋 및 푸시

- [ ] 4. 중복 처리 방지 모듈 구현 (`src/dedup/dedupCache.ts`)
  - [ ] 4.1 DedupCache 구현
    - `Map<string, number>` 기반 TTL 캐시
    - `has()`, `add()`, `clear()` 메서드
    - 주기적 만료 항목 정리 (setInterval)
    - TTL은 설정에서 관리 (기본값: 30분)
    - _Requirements: 6.1, 6.2, 6.3_
  - [ ]* 4.2 Property 9 속성 테스트: 중복 이슈 무시
    - **Property 9: 중복 이슈 무시**
    - 임의의 이슈 ID → add() 직후 has()가 true 반환
    - **Validates: Requirements 6.1, 6.2**
  - [ ]* 4.3 Property 10 속성 테스트: TTL 만료 후 재처리 허용
    - **Property 10: TTL 만료 후 재처리 허용**
    - 임의의 이슈 ID + TTL → TTL 경과 후 has()가 false 반환
    - **Validates: Requirements 6.3**
  - [ ] 4.4 커밋 및 푸시

- [ ] 5. 체크포인트 - 기반 모듈 검증
  - 모든 테스트가 통과하는지 확인하고, 질문이 있으면 사용자에게 문의한다.

- [ ] 6. Sentry MCP 정보 수집 모듈 구현 (`src/collector/sentryMcpCollector.ts`)
  - [ ] 6.1 SentryMcpCollector 구현
    - MCP 클라이언트 초기화 (@modelcontextprotocol/sdk 사용)
    - `get_issue_details` MCP 도구 호출: Short ID로 이슈 상세 정보 조회 (스택트레이스, 태그, 브레드크럼 등)
    - `analyze_issue_with_seer` MCP 도구 호출: 이슈 ID로 Seer AI 근본 원인 분석 및 코드 수정 제안 조회
    - MCP 응답을 `SentryErrorDetail` (seerAnalysis 포함)로 구조화
    - Fallback 전략: `get_issue_details` 실패 시 SentryAlertInfo만으로 진행, `analyze_issue_with_seer` 실패 시 seerAnalysis: null로 진행
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [ ]* 6.2 Property 4 속성 테스트: MCP 응답 구조화 완전성
    - **Property 4: MCP 응답 구조화 완전성**
    - 임의의 유효한 McpIssueDetailsResponse → SentryErrorDetail 필수 필드 모두 포함 검증
    - **Validates: Requirements 2.2, 2.4**
  - [ ]* 6.3 단위 테스트: SentryMcpCollector fallback 동작
    - `get_issue_details` 실패 시 SentryAlertInfo 기반 분석 진행 검증
    - `analyze_issue_with_seer` 실패 시 seerAnalysis: null로 진행 검증
    - MCP 서버 연결 실패 시 graceful degradation 검증
    - _Requirements: 2.3, 2.5_
  - [ ] 6.4 커밋 및 푸시

- [ ] 7. LLM 분석 모듈 구현 (`src/analyzer/llmAnalyzer.ts`)
  - [ ] 7.1 LLMAnalyzer 구현
    - `analyze()`: SentryErrorDetail 기반 분석 (오류 메시지, 스택트레이스, 브레드크럼 + Seer 분석 결과 통합 프롬프트)
    - Seer 분석 결과가 있는 경우: Seer 근본 원인 + 코드 수정 제안을 LLM 프롬프트에 포함하여 기술적 분석과 비즈니스 컨텍스트 분석 결합
    - Seer 분석 결과가 없는 경우: 오류 정보만으로 LLM 분석 진행
    - investigate 스킬 참고: 증상 정리, 근본/보조 원인 구분, 위험도 평가 (🔴/⚠️/🟢) 포함
    - `analyzeFromSlackInfo()`: SentryAlertInfo만으로 분석 (MCP 실패 시)
    - 타임아웃 30초 설정
    - LLM API 실패 시 기본 응답(오류 정보 요약만) 생성
    - _Requirements: 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_
  - [ ]* 7.2 Property 5 속성 테스트: LLM 프롬프트에 오류 정보 및 Seer 분석 결과 포함
    - **Property 5: LLM 프롬프트에 오류 정보 및 Seer 분석 결과 포함**
    - 임의의 SentryErrorDetail → 프롬프트에 오류 메시지, 스택트레이스, 브레드크럼 포함 검증
    - seerAnalysis 존재 시 Seer 근본 원인, 코드 수정 제안도 프롬프트에 포함 검증
    - **Validates: Requirements 2.5, 3.1**
  - [ ]* 7.3 Property 6 속성 테스트: 분석 결과 완전성
    - **Property 6: 분석 결과 완전성**
    - 임의의 AnalysisResult → 필수 필드 비어있지 않음, riskLevel 유효, solutions 최소 1개 검증
    - **Validates: Requirements 3.2, 3.3**
  - [ ]* 7.4 단위 테스트: LLM API 실패 시 기본 응답 생성
    - LLM API 호출 실패 시 기본 응답 생성 검증
    - Seer 결과 유무에 따른 프롬프트 구성 차이 검증
    - _Requirements: 3.4_
  - [ ] 7.5 커밋 및 푸시

- [ ] 8. 담당자 매핑 모듈 구현 (`src/mapper/assigneeMapper.ts`)
  - [ ] 8.1 AssigneeMapper 구현
    - 매핑 우선순위: 프로젝트+오류유형 > 프로젝트 > 기본 담당자
    - 설정 파일에서 매핑 정보 로드
    - 항상 유효한 Slack 사용자 ID 반환
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ]* 8.2 Property 7 속성 테스트: 담당자 매핑 완전성
    - **Property 7: 담당자 매핑 완전성**
    - 임의의 프로젝트명 + 오류 유형 + 매핑 설정 → 항상 유효한 Slack 사용자 ID 반환
    - **Validates: Requirements 4.1, 4.2**
  - [ ] 8.3 커밋 및 푸시

- [ ] 9. 체크포인트 - 핵심 로직 검증
  - 모든 테스트가 통과하는지 확인하고, 질문이 있으면 사용자에게 문의한다.

- [ ] 10. 스레드 응답 모듈 구현 (`src/responder/threadResponder.ts`)
  - [ ] 10.1 ThreadResponder 구현
    - `buildResponse()`: AnalysisResult → Slack Block Kit 블록 변환
      - investigate 스킬 참고 보고서 형식: 증상 요약, 위험도 (🔴/⚠️/🟢), 영향 범위, 근본 원인, 보조 원인, 해결 대안 (Seer 코드 수정 제안 포함), 즉시 대응 조치, 담당자 멘션(`<@사용자ID>`), Sentry 이벤트 링크
    - `send()`: Slack API로 스레드 응답 전송
    - 재시도 로직: 최대 3회, 지수 백오프 (1s, 2s, 4s)
    - 3회 실패 시 관리자 알림 전송
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [ ]* 10.2 Property 8 속성 테스트: 스레드 응답 필수 정보 포함
    - **Property 8: 스레드 응답 필수 정보 포함**
    - 임의의 AnalysisResult (위험도 포함) + 담당자 ID + 이슈 URL → Block Kit에 모든 필수 정보 포함 검증
    - **Validates: Requirements 5.1, 5.2, 5.3**
  - [ ]* 10.3 단위 테스트: Slack API 재시도 로직
    - 3회 재시도 후 관리자 알림 전송 검증
    - 위험도별 이모지 표시 (🔴/⚠️/🟢) 검증
    - _Requirements: 5.4, 5.5_
  - [ ] 10.4 커밋 및 푸시

- [ ] 11. 파이프라인 통합 및 앱 진입점 구현 (`src/index.ts`)
  - [ ] 11.1 Slack Bolt 앱 초기화 및 이벤트 핸들러 연결
    - Bolt 앱 생성 (Socket Mode)
    - MCP 클라이언트 초기화 (Sentry MCP 서버 연결)
    - `message` 이벤트 핸들러 등록
    - 파이프라인 연결: MessageDetector → DedupCache → SentryMcpCollector (get_issue_details → analyze_issue_with_seer) → LLMAnalyzer (Seer 결과 통합) → AssigneeMapper → ThreadResponder
    - ConfigManager 초기화 및 핫 리로드 콜백 등록
    - 구조화된 로깅 (JSON 형식)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.5, 3.1, 4.1, 5.1, 6.1, 7.1, 7.2_
  - [ ]* 11.2 통합 테스트: 전체 파이프라인 흐름
    - 모킹된 MCP 클라이언트와 외부 API로 메시지 감지 → MCP 정보 수집 → Seer 분석 → LLM 분석 → 응답 전체 흐름 검증
    - MCP 서버 연결 실패 시 graceful degradation 검증
    - _Requirements: 1.1, 2.2, 2.5, 3.1, 5.1_
  - [ ] 11.3 커밋 및 푸시

- [ ] 12. 최종 체크포인트 - 전체 시스템 검증
  - 모든 테스트가 통과하는지 확인하고, 질문이 있으면 사용자에게 문의한다.

## Notes

- `*` 표시된 태스크는 선택적이며 빠른 MVP를 위해 건너뛸 수 있습니다
- 각 태스크는 특정 요구사항을 참조하여 추적 가능합니다
- 체크포인트에서 점진적 검증을 수행합니다
- 속성 테스트는 보편적 정확성 속성을 검증하고, 단위 테스트는 구체적 예시와 에지 케이스를 검증합니다
- 각 단계 완료 후 커밋 및 푸시를 수행합니다
- **핵심 변경**: Sentry REST API (axios) 대신 Sentry MCP 도구 (`get_issue_details`, `analyze_issue_with_seer`)를 사용합니다
- **분석 구조**: investigate 스킬의 접근 방식을 참고하여 증상, 영향 범위, 근본/보조 원인, 위험도 평가를 포함한 체계적 보고서를 생성합니다
