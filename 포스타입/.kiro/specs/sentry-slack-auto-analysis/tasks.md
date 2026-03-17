# 구현 계획: Sentry-Slack 자동 분석 봇

## 개요

Slack 멘션 이벤트를 수신하여 Sentry 알림 메시지를 파싱하고, Bedrock Agent를 통해 장애 원인을 분석한 뒤 Slack 스레드에 Block Kit 형식으로 응답하는 시스템을 구현한다. Lambda(Node.js 20.x) + API Gateway + Bedrock Agent + MCP 서버 구성으로 진행한다.

## Tasks

- [ ] 1. 프로젝트 구조 및 핵심 타입 정의
  - [ ] 1.1 프로젝트 초기화 및 디렉토리 구조 생성
    - Node.js 20.x 기반 TypeScript 프로젝트 초기화 (`package.json`, `tsconfig.json`)
    - `src/` 하위에 `handlers/`, `parsers/`, `services/`, `types/`, `utils/` 디렉토리 생성
    - 의존성 설치: `@aws-sdk/client-bedrock-agent-runtime`, `@slack/web-api`, `fast-check` (devDependency)
    - _Requirements: 전체_

  - [ ] 1.2 핵심 인터페이스 및 타입 정의
    - `src/types/` 에 설계 문서의 데이터 모델 구현: `SlackEventPayload`, `SlackUrlVerification`, `SlackAppMentionEvent`, `ParsedSentryAlert`, `BedrockAgentInput`, `AnalysisRequest`, `CollectedData`, `AnalysisResult`, `SlackThreadResponse`, `SlackRetryConfig`
    - _Requirements: 1.3, 2.1, 3.2, 5.2, 6.2_

- [ ] 2. Slack 이벤트 수신 및 검증 구현
  - [ ] 2.1 Slack 요청 서명 검증 함수 구현
    - `src/utils/slack-signature.ts`에 Slack Signing Secret 기반 요청 서명 검증 함수 작성
    - AWS Secrets Manager에서 Signing Secret 조회 로직 포함
    - 검증 실패 시 HTTP 401 반환
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ] 2.2 Slack 이벤트 핸들러 (Lambda 엔트리포인트) 구현
    - `src/handlers/mention-receiver.ts`에 Lambda 핸들러 작성
    - `url_verification` 챌린지 응답 처리
    - `app_mention` 이벤트에서 채널 ID, 스레드 TS(`thread_ts` 또는 `ts`), 메시지 텍스트 추출
    - 채널 ID 또는 스레드 TS 누락 시 요청 무시 및 오류 로그 기록
    - 3초 이내 ACK 응답을 위해 비동기 처리 분리
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 2.3 Property 1 속성 테스트: Slack 이벤트 페이로드 파싱
    - **Property 1: Slack 이벤트 페이로드 파싱**
    - 랜덤 채널 ID, 타임스탬프, 텍스트를 가진 Slack 이벤트 페이로드를 생성하여 추출 함수가 원본 필드와 일치하는 값을 반환하는지 검증
    - fast-check 사용, 최소 100회 반복
    - **Validates: Requirements 1.3**

  - [ ]* 2.4 단위 테스트: Slack 이벤트 수신 및 검증
    - `url_verification` 챌린지 응답 테스트
    - 유효한 `app_mention` 이벤트 처리 테스트
    - 채널 ID 누락 시 요청 무시 테스트
    - 스레드 TS 누락 시 요청 무시 테스트
    - Slack 서명 검증 실패 시 401 반환 테스트
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 8.1, 8.3_

- [ ] 3. Sentry 알림 메시지 파싱 구현
  - [ ] 3.1 메시지 파싱 함수 구현
    - `src/parsers/sentry-message-parser.ts`에 `extractProblemUrl`, `isSentryUrl`, `parseSentryAlert` 함수 작성
    - 메시지 텍스트에서 모든 URL 추출 후 Sentry 도메인(`*.sentry.io`) URL 필터링
    - 오류 유형, 오류 메시지 추출 로직 구현
    - 문제 URL 추출 실패 시 `null` 반환
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 3.2 Property 2 속성 테스트: Sentry 알림 메시지 파싱 및 URL 필터링
    - **Property 2: Sentry 알림 메시지 파싱 및 URL 필터링**
    - Sentry URL과 서비스 URL이 혼합된 랜덤 메시지 텍스트를 생성하여 파싱 함수가 Sentry URL을 제외하고 서비스 URL만 반환하는지 검증
    - fast-check 사용, 최소 100회 반복
    - **Validates: Requirements 2.1, 2.2**

  - [ ]* 3.3 단위 테스트: 메시지 파싱
    - Sentry URL과 서비스 URL 혼합 메시지에서 서비스 URL만 추출 테스트
    - 문제 URL 없는 메시지에서 null 반환 테스트
    - 오류 유형/메시지 추출 테스트
    - _Requirements: 2.1, 2.2, 2.3_

- [ ] 4. 체크포인트 - 이벤트 수신 및 파싱 검증
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Bedrock Agent 호출 및 상태 메시지 전송 구현
  - [ ] 5.1 Slack 메시지 전송 유틸리티 구현
    - `src/utils/slack-messenger.ts`에 Slack Web API를 사용한 메시지 전송 함수 작성
    - 스레드 응답 전송 기능 (`thread_ts` 지정)
    - 지수 백오프(1초, 2초, 4초) 기반 최대 3회 재시도 로직 구현
    - 3회 실패 후 CloudWatch Logs에 전송 실패 기록
    - AWS Secrets Manager에서 Slack Bot 토큰 조회
    - _Requirements: 6.1, 6.3, 6.4, 8.2_

  - [ ] 5.2 Bedrock Agent 호출 서비스 구현
    - `src/services/bedrock-agent-service.ts`에 Bedrock Agent 비동기 호출 함수 작성
    - `BedrockAgentInput` 파라미터 5개 필드(문제 URL, 오류 유형, 오류 메시지, 채널 ID, 스레드 TS) 전달
    - 호출 실패 시 Slack 스레드에 오류 메시지 전송
    - "분석을 시작합니다..." 상태 메시지 전송
    - 문제 URL 추출 실패 시 "Sentry 알림에서 문제 URL 정보를 찾을 수 없습니다" 안내 메시지 전송
    - _Requirements: 2.3, 3.1, 3.2, 3.3, 3.4_

  - [ ]* 5.3 Property 3 속성 테스트: Bedrock Agent 호출 파라미터 완전성
    - **Property 3: Bedrock Agent 호출 파라미터 완전성**
    - 랜덤 ParsedSentryAlert + Slack 이벤트 컨텍스트를 생성하여 Bedrock Agent 호출 파라미터가 5개 필드를 모두 포함하는지 검증
    - fast-check 사용, 최소 100회 반복
    - **Validates: Requirements 3.2**

  - [ ]* 5.4 단위 테스트: Bedrock Agent 호출 및 Slack 메시지 전송
    - 성공적 파싱 후 비동기 호출 트리거 테스트
    - 호출 실패 시 오류 메시지 전송 테스트
    - "분석을 시작합니다..." 상태 메시지 전송 테스트
    - Slack 메시지 전송 실패 시 최대 3회 재시도 테스트
    - 3회 실패 후 CloudWatch 로깅 테스트
    - _Requirements: 3.1, 3.3, 3.4, 6.3, 6.4_

- [ ] 6. 체크포인트 - Bedrock Agent 호출 및 메시지 전송 검증
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. 분석 결과 처리 및 Block Kit 응답 구현
  - [ ] 7.1 분석 결과 포맷터 구현
    - `src/services/analysis-formatter.ts`에 `AnalysisResult`를 Slack Block Kit 형식으로 변환하는 함수 작성
    - 필수 5개 항목(오류 요약, 추정 원인, 관련 코드 위치, 영향 범위, 권장 대응 방안) 블록 생성
    - 부분 실패 시 `dataCollectionNotes`를 context 블록으로 추가
    - 부분 결과(`isPartialResult`) 여부에 따른 안내 메시지 포함
    - _Requirements: 5.2, 6.2, 4.4, 4.5, 4.6_

  - [ ]* 7.2 Property 4 속성 테스트: 부분 실패 허용
    - **Property 4: 부분 실패 허용 (Partial Failure Tolerance)**
    - 3개 데이터 소스의 성공/실패 조합(2^3 = 8가지)을 랜덤 생성하여, 최소 하나의 소스가 성공하면 분석 결과가 생성되고 실패 소스가 `dataCollectionNotes`에 명시되는지 검증
    - fast-check 사용, 최소 100회 반복
    - **Validates: Requirements 4.4, 4.5, 4.6**

  - [ ]* 7.3 Property 5 속성 테스트: 분석 결과 필수 필드 포함
    - **Property 5: 분석 결과 필수 필드 포함**
    - 랜덤 CollectedData로부터 AnalysisResult를 생성하여 5개 필수 필드가 모두 비어있지 않은 값으로 포함되는지 검증
    - fast-check 사용, 최소 100회 반복
    - **Validates: Requirements 5.2**

  - [ ]* 7.4 Property 6 속성 테스트: Block Kit 형식 변환
    - **Property 6: Block Kit 형식 변환**
    - 랜덤 AnalysisResult를 생성하여 Block Kit 변환 함수가 필수 5개 항목을 모두 블록에 포함하는지 검증
    - fast-check 사용, 최소 100회 반복
    - **Validates: Requirements 6.2**

  - [ ]* 7.5 단위 테스트: 분석 결과 포맷팅
    - Block Kit 형식 변환 정확성 테스트
    - 부분 데이터 분석 시 추가 조사 영역 명시 테스트
    - 데이터 수집 실패 메모가 context 블록에 포함되는지 테스트
    - _Requirements: 5.2, 5.3, 6.2_

- [ ] 8. 분석 처리 시간 제한 구현
  - [ ] 8.1 타임아웃 처리 로직 구현
    - `src/services/bedrock-agent-service.ts`에 120초 타임아웃 로직 추가
    - 타임아웃 초과 시 부분 분석 결과와 함께 "분석 시간이 초과되었습니다. 수집된 데이터 범위 내에서 부분 결과를 제공합니다." 메시지를 Slack 스레드에 전송
    - _Requirements: 7.1, 7.2_

  - [ ]* 8.2 단위 테스트: 타임아웃 처리
    - 120초 이내 정상 완료 테스트
    - 120초 초과 시 부분 결과 전송 테스트
    - _Requirements: 7.1, 7.2_

- [ ] 9. 전체 통합 및 Lambda 핸들러 연결
  - [ ] 9.1 Lambda 핸들러에 전체 플로우 통합
    - `src/handlers/mention-receiver.ts`에서 모든 컴포넌트를 연결하여 전체 플로우 구현
    - 이벤트 수신 → 서명 검증 → 메시지 파싱 → Bedrock Agent 호출 → 결과 포맷팅 → Slack 응답 전송
    - 각 단계별 오류 처리 및 CloudWatch 로깅 통합
    - _Requirements: 1.1, 1.2, 2.1, 3.1, 6.1_

  - [ ]* 9.2 통합 테스트: 전체 플로우
    - 정상 플로우 (멘션 → 파싱 → 분석 → 응답) 통합 테스트
    - 문제 URL 추출 실패 시 안내 메시지 전송 통합 테스트
    - Bedrock Agent 호출 실패 시 오류 메시지 전송 통합 테스트
    - 부분 데이터 수집 실패 시 부분 결과 전송 통합 테스트
    - _Requirements: 1.1, 2.3, 3.4, 4.4, 4.5, 4.6, 6.1_

- [ ] 10. 최종 체크포인트 - 전체 테스트 통과 확인
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- `*` 표시된 태스크는 선택 사항이며 빠른 MVP를 위해 건너뛸 수 있습니다
- 각 태스크는 추적 가능성을 위해 특정 요구사항을 참조합니다
- 체크포인트는 점진적 검증을 보장합니다
- 속성 테스트는 보편적 정확성 속성을 검증하고, 단위 테스트는 특정 예제와 에지 케이스를 검증합니다
