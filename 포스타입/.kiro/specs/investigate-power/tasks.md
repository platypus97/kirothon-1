# 구현 계획: Investigate Power

## 개요

Kiro Power 형태의 Sentry 에러 자동 분석 도구를 구현한다. POWER.md 매니페스트 파일과 3개의 Steering 파일(phase1-sentry-context.md, phase2-code-analysis.md, phase3-report.md)을 작성하여, `/investigate <slack_thread_url>` 명령으로 슬랙 스레드의 Sentry 이슈를 자동 분석하고 RCA 보고서를 생성하는 Power를 완성한다. 모든 산출물은 마크다운 파일이다. 코드 분석은 Kiro IDE의 기본 파일 탐색 기능으로 워크스페이스 코드를 직접 읽는다.

## Tasks

- [x] 1. POWER.md 매니페스트 파일 작성
  - [x] 1.1 Power 메타데이터 및 실행 명령어 정의
    - Power 이름(`investigate`), 설명, 실행 명령어(`/investigate`) 정의
    - 필수 MCP 서버 목록 명시: Slack MCP, Sentry MCP
    - _Requirements: 1.1, 1.3, 7.1_

  - [x] 1.2 Onboarding 섹션 작성
    - Slack Thread URL 형식 검증 로직 정의 (`https://<workspace>.slack.com/archives/<channel_id>/p<timestamp>`)
    - 유효하지 않은 URL에 대한 에러 메시지 및 올바른 형식 예시 포함
    - Slack MCP, Sentry MCP 2개 서버 연결 상태 확인 절차 정의
    - 각 MCP 서버 연결 실패 시 개별 설정 가이드 제공 및 분석 중단 지시
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.3, 8.1, 8.2, 8.3_

  - [x] 1.3 Steering 파일 실행 순서 정의
    - phase1-sentry-context.md → phase2-code-analysis.md → phase3-report.md 순서 명시
    - 각 단계 완료 시 결과 요약 표시 지시 포함
    - _Requirements: 7.1, 7.2_

- [x] 2. Checkpoint - POWER.md 검증
  - POWER.md 파일이 모든 Onboarding 요구사항(URL 검증, MCP 연결 확인, 설정 가이드)을 포함하는지 확인. 사용자에게 질문이 있으면 문의.

- [x] 3. phase1-sentry-context.md Steering 파일 작성
  - [x] 3.1 Slack MCP를 통한 스레드 메시지 읽기 지시 작성
    - Slack Thread URL에서 channel_id와 thread_ts를 파싱하는 방법 명시
    - Slack MCP를 사용하여 해당 스레드의 전체 메시지를 읽는 지시 작성
    - _Requirements: 2.1_

  - [x] 3.2 Sentry 이슈 링크 추출 로직 작성
    - 스레드 메시지에서 Sentry 이슈 링크를 추출하는 정규식 패턴 명시 (`https://[^/]+\.sentry\.io/issues/\d+`)
    - 여러 개의 Sentry 이슈 링크가 있을 경우 모두 추출하도록 지시
    - 추출된 링크에서 issue_id, organization 등 정보 파싱 방법 명시
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Sentry MCP를 통한 이슈 상세 조회 지시 작성
    - 추출된 각 Sentry 이슈 링크에 대해 Sentry MCP로 상세 정보 조회 지시
    - 수집 대상 정보 명시: 스택트레이스, 최근 이벤트 상세, 태그 정보, 발생 횟수, 최초/최근 발생 시간, 영향받는 사용자 수
    - 스택트레이스에서 소스 파일 경로와 라인 번호 목록 추출 지시 (inApp 프레임 우선)
    - Sentry MCP 조회 실패 시 실패 사유와 링크를 기록하고 분석 중단하는 에러 처리 지시
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 3.4 Phase 1 결과 요약 출력 지시 작성
    - 추출된 Sentry 이슈 수, 각 이슈의 에러 타입, 발생 횟수, 분석 대상 파일 경로 목록 등 요약 정보 출력 지시
    - _Requirements: 7.2_

- [ ] 4. phase2-code-analysis.md Steering 파일 작성
  - [x] 4.1 Kiro IDE를 통한 워크스페이스 소스 파일 읽기 지시 작성
    - Phase 1에서 추출된 스택트레이스의 소스 파일 경로와 라인 번호를 기반으로 Kiro IDE의 기본 파일 탐색 기능을 통해 워크스페이스에서 소스 파일 읽기 지시
    - inApp 프레임의 파일을 우선적으로 분석하도록 지시
    - 파일을 찾을 수 없는 경우 "해당 파일을 찾지 못함"을 기록하도록 에러 처리 지시
    - _Requirements: 4.1, 4.5_

  - [x] 4.2 호출 체인 추적 및 Next.js 특화 분석 지시 작성
    - 실패 지점의 호출 체인을 추적하여 상위/하위 메서드를 함께 분석하도록 지시
    - Next.js 프론트엔드 코드의 에러 핸들링 패턴, 비동기 처리 로직(async/await, Promise), API 호출 체인에 특별히 주의하여 분석하도록 지시
    - 최소 3개 이상 관련 파일을 분석한 후에 원인 추정을 시작하도록 제약 조건 명시
    - _Requirements: 4.2, 4.3, 4.4_

  - [x] 4.3 Phase 2 결과 요약 출력 지시 작성
    - 분석한 파일 수, 추정된 근본 원인 등 요약 정보 출력 지시
    - _Requirements: 7.2_

- [x] 5. Checkpoint - Phase 1, 2 Steering 파일 검증
  - phase1-sentry-context.md와 phase2-code-analysis.md가 요구사항의 Sentry 조회(요구사항 2, 3)와 코드 분석(요구사항 4)을 모두 커버하는지 확인. 사용자에게 질문이 있으면 문의.

- [x] 6. phase3-report.md Steering 파일 작성
  - [x] 6.1 RCA 보고서 생성 지시 작성
    - RCA 보고서에 포함할 섹션 정의: 이슈 요약, 에러 상세(스택트레이스 포함), 근본 원인 분석, 관련 코드 경로, 즉시 조치 방안, 재발 방지 제안
    - 이슈 요약 섹션에 에러 타입, 발생 위치, 이벤트 수, 영향 사용자 수, Sentry 이슈 링크 포함 지시
    - 근본 원인 분석 섹션에 관련 소스 파일 경로와 라인 번호 포함 지시
    - 추정이 포함된 부분에 `[추정]` 태그를 명확히 표기하도록 지시
    - 즉시 조치 방안에 구체적인 코드 수정 제안 또는 설정 변경 사항 포함 지시
    - 분석 과정에서 건너뛴 단계와 그 사유를 기록하도록 지시
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 6.2 담당 파트 판단 로직 작성
    - 코드 경로 또는 Sentry 프로젝트 정보를 기반으로 FE 파트 멘션 대상을 판단하는 규칙 작성
    - 스튜디오/에디터 관련 영역 → @creator_fe
    - 소비자 영역 → @consumer_fe
    - 어디에도 해당하지 않거나 판단 불가 → @core_fe (기본값)
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 6.3 사용자 확인 후 Slack MCP를 통한 스레드 게시 지시 작성
    - RCA 보고서 내용과 담당 파트 멘션 대상을 사용자에게 먼저 표시하고 슬랙 공유 여부를 확인하도록 지시
    - 사용자가 승인하면 원본 슬랙 스레드에 Slack_Thread_Reply로 게시하도록 지시
    - 사용자가 거부하면 슬랙 게시를 건너뛰고 채팅 응답으로만 제공하도록 지시
    - Slack MCP 게시 실패 시 실패 사유를 사용자에게 표시하고 RCA 보고서 내용을 채팅 응답으로 대체 제공하도록 에러 처리 지시
    - _Requirements: 6.1, 6.2, 6.8, 6.9_

  - [x] 6.4 Phase 3 결과 요약 출력 지시 작성
    - RCA 보고서 생성 완료, 슬랙 게시 결과, 멘션 대상 파트 등 최종 요약 정보 출력 지시
    - _Requirements: 7.2_

- [x] 7. Final Checkpoint - 전체 파일 검증
  - POWER.md, phase1-sentry-context.md, phase2-code-analysis.md, phase3-report.md 4개 파일이 모두 작성되었는지 확인. 요구사항 1~8의 모든 인수 조건이 커버되는지 최종 검증. 사용자에게 질문이 있으면 문의.

## Notes

- 모든 산출물은 마크다운 파일이며, 프로그래밍 코드 구현이 아닌 Kiro Power Steering 파일 작성이 핵심
- 각 태스크는 이전 태스크의 결과물을 기반으로 점진적으로 진행됨
- Checkpoint에서 요구사항 커버리지를 검증하여 누락을 방지
- 2개 MCP 서버(Slack, Sentry)가 필수이며, Onboarding에서 연결 확인 필수
- 코드 분석은 Kiro IDE의 기본 파일 탐색 기능으로 워크스페이스 코드를 직접 읽음
