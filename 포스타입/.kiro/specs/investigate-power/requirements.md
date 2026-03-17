# 요구사항 문서

## 소개

`/investigate <slack_thread_url>` 명령으로 실행되는 Kiro Power로, 슬랙 스레드에서 Sentry 이슈 링크를 추출하고, Sentry MCP를 통해 에러 상세 정보를 조회하며, Kiro IDE의 기본 코드 탐색 기능으로 워크스페이스의 코드를 분석하여 근본 원인 분석(RCA) 보고서를 생성한다. 프론트엔드(Next.js) Sentry 프로젝트 기반의 에러 분석에 특화되어 있다. Slack MCP, Sentry MCP 2개가 필수이다.

## 용어집

- **Investigate_Power**: `/investigate` 명령으로 실행되는 Kiro Power. 슬랙 스레드의 Sentry 이슈 링크 기반 에러 분석을 수행하는 자동화 도구
- **Slack_MCP**: 슬랙 워크스페이스의 스레드 메시지를 읽고 메시지를 게시하기 위한 MCP 서버. 필수 MCP
- **Slack_Thread_Reply**: Slack_MCP를 통해 원본 슬랙 스레드에 게시하는 댓글 메시지
- **FE_Part_Mention**: 프론트엔드 담당 파트 멘션. 코드 경로 또는 Sentry 프로젝트 정보를 기반으로 @creator_fe, @consumer_fe, @core_fe 중 하나를 선택하여 멘션한다
- **Sentry_MCP**: Sentry 프로젝트의 에러 상세 정보(스택트레이스, 이벤트, 태그 등)를 조회하기 위한 MCP 서버. 필수 MCP
- **RCA_Report**: Root Cause Analysis 보고서. Sentry 에러의 근본 원인, 관련 코드 경로, 즉시 조치 방안을 포함하는 분석 결과 문서
- **Slack_Thread_URL**: 슬랙 스레드를 식별하는 URL. `https://<workspace>.slack.com/archives/<channel_id>/p<timestamp>` 형식
- **Sentry_Issue_Link**: 슬랙 스레드 메시지에 포함된 Sentry 이슈 페이지 URL. 사용자가 제공하는 슬랙 스레드에는 항상 존재함
- **Steering_File**: Kiro Power의 각 분석 단계를 정의하는 마크다운 파일
- **Onboarding**: Power 실행 시 최초로 수행되는 사전 검증 단계

## 요구사항

### 요구사항 1: Power 실행 및 입력 검증

**사용자 스토리:** 개발자로서, `/investigate <slack_thread_url>` 명령으로 Sentry 에러 분석을 시작하고 싶다. 그래야 슬랙에 공유된 Sentry 이슈를 빠르게 조사할 수 있다.

#### 인수 조건

1. WHEN 사용자가 `/investigate <slack_thread_url>` 명령을 입력하면, THE Investigate_Power SHALL Slack_Thread_URL 형식을 검증하고 유효한 경우 분석을 시작한다
2. IF Slack_Thread_URL 형식이 유효하지 않으면, THEN THE Investigate_Power SHALL 올바른 URL 형식 예시(`https://<workspace>.slack.com/archives/<channel_id>/p<timestamp>`)와 함께 에러 메시지를 반환한다
3. WHEN 분석이 시작되면, THE Investigate_Power SHALL Slack_MCP, Sentry_MCP 2개 서버의 연결 상태를 확인한다
4. IF Slack_MCP 서버에 연결할 수 없으면, THEN THE Investigate_Power SHALL Slack_MCP 설정 가이드와 함께 에러 메시지를 반환하고 분석을 중단한다
5. IF Sentry_MCP 서버에 연결할 수 없으면, THEN THE Investigate_Power SHALL Sentry_MCP 설정 가이드와 함께 에러 메시지를 반환하고 분석을 중단한다

### 요구사항 2: Sentry 이슈 링크 추출

**사용자 스토리:** 개발자로서, 슬랙 스레드에서 Sentry 이슈 링크를 자동으로 추출하고 싶다. 그래야 수동으로 링크를 복사하는 번거로움 없이 바로 분석을 시작할 수 있다.

#### 인수 조건

1. WHEN Slack_MCP를 통해 스레드 메시지를 읽으면, THE Investigate_Power SHALL 스레드 메시지에서 Sentry_Issue_Link를 추출한다
2. WHEN Sentry_Issue_Link를 추출하면, THE Investigate_Power SHALL 해당 링크를 Sentry_MCP 상세 조회의 입력으로 사용한다
3. IF 스레드에 여러 개의 Sentry_Issue_Link가 존재하면, THEN THE Investigate_Power SHALL 모든 링크를 추출하고 각각에 대해 분석을 수행한다

### 요구사항 3: Sentry 에러 상세 조회

**사용자 스토리:** 개발자로서, Sentry 이슈 링크를 통해 스택트레이스와 상세 에러 정보를 자동으로 조회하고 싶다. 그래야 에러의 정확한 발생 지점과 맥락을 파악할 수 있다.

#### 인수 조건

1. WHEN Sentry_Issue_Link가 추출되면, THE Investigate_Power SHALL Sentry_MCP를 통해 해당 이슈의 상세 정보를 조회한다
2. WHEN Sentry 이슈 상세 정보를 조회하면, THE Investigate_Power SHALL 스택트레이스, 최근 이벤트 상세, 태그 정보, 발생 횟수, 최초 발생 시간, 최근 발생 시간, 영향받는 사용자 수를 수집한다
3. WHEN 스택트레이스를 수집하면, THE Investigate_Power SHALL 스택트레이스에서 소스 파일 경로와 라인 번호 목록을 추출하여 코드 분석 단계의 입력으로 준비한다
4. IF Sentry_MCP를 통한 이슈 조회가 실패하면, THEN THE Investigate_Power SHALL 조회 실패 사유와 Sentry_Issue_Link를 보고서에 기록하고 분석을 중단한다

### 요구사항 4: 코드베이스 분석

**사용자 스토리:** 개발자로서, Sentry 스택트레이스에서 식별된 파일과 라인 번호를 기반으로 워크스페이스의 코드를 자동 분석하고 싶다. 그래야 에러의 근본 원인을 정확히 파악할 수 있다.

#### 인수 조건

1. WHEN Sentry 스택트레이스에서 소스 파일 경로와 라인 번호가 추출되면, THE Investigate_Power SHALL Kiro IDE의 기본 코드 탐색 기능을 통해 워크스페이스에서 해당 소스 파일을 읽고 실패 지점의 코드를 분석한다
2. WHEN 코드를 분석하면, THE Investigate_Power SHALL 실패 지점의 호출 체인을 추적하여 관련된 상위/하위 메서드를 함께 분석한다
3. WHEN 코드를 분석하면, THE Investigate_Power SHALL Next.js 프론트엔드 코드의 에러 핸들링 패턴, 비동기 처리 로직, API 호출 체인에 특별히 주의하여 분석한다
4. THE Investigate_Power SHALL 관련 파일을 3개 이상 분석한 후에 원인 추정을 시작한다
5. IF 워크스페이스에서 관련 소스 파일을 찾을 수 없으면, THEN THE Investigate_Power SHALL 파일 경로와 함께 "해당 파일을 찾지 못함"을 보고서에 기록한다

### 요구사항 5: RCA 보고서 생성

**사용자 스토리:** 개발자로서, Sentry 에러 정보와 코드 분석 결과를 종합한 근본 원인 분석 보고서를 받고 싶다. 그래야 이슈 해결과 후속 조치를 빠르게 진행할 수 있다.

#### 인수 조건


1. WHEN 모든 분석 단계가 완료되면, THE Investigate_Power SHALL 다음 섹션을 포함하는 RCA_Report를 생성한다: 이슈 요약, 에러 상세(스택트레이스 포함), 근본 원인 분석, 관련 코드 경로, 즉시 조치 방안, 재발 방지 제안
2. THE Investigate_Power SHALL RCA_Report의 이슈 요약 섹션에 Sentry에서 조회한 에러 타입, 발생 위치, 이벤트 수, 영향 사용자 수, Sentry_Issue_Link를 포함한다
3. THE Investigate_Power SHALL RCA_Report의 근본 원인 분석 섹션에 관련 소스 파일 경로와 라인 번호를 포함한다
4. THE Investigate_Power SHALL RCA_Report에서 추정이 포함된 부분을 "[추정]" 태그로 명확히 표기한다
5. THE Investigate_Power SHALL RCA_Report의 즉시 조치 방안에 구체적인 코드 수정 제안 또는 설정 변경 사항을 포함한다
6. THE Investigate_Power SHALL RCA_Report에 분석 과정에서 건너뛴 단계와 그 사유를 기록한다

### 요구사항 6: 슬랙 스레드 게시 및 담당 파트 멘션

**사용자 스토리:** 개발자로서, RCA 보고서가 완성되면 해당 슬랙 스레드에 분석 결과가 자동으로 게시되고 담당 프론트엔드 파트가 멘션되길 원한다. 그래야 관련 담당자가 즉시 분석 결과를 확인하고 대응할 수 있다.

#### 인수 조건

1. WHEN RCA_Report 생성이 완료되면, THE Investigate_Power SHALL RCA_Report 내용과 판단된 FE_Part_Mention 대상을 사용자에게 먼저 표시하고 슬랙 공유 여부를 확인한다
2. WHEN 사용자가 슬랙 공유를 승인하면, THE Investigate_Power SHALL Slack_MCP를 통해 원본 슬랙 스레드에 Slack_Thread_Reply로 RCA_Report 내용을 게시한다
3. WHEN Slack_Thread_Reply를 게시하면, THE Investigate_Power SHALL 코드 경로 또는 Sentry 프로젝트 정보를 기반으로 FE_Part_Mention 대상을 판단하여 메시지에 포함한다
3. WHEN 분석 대상 코드 경로가 스튜디오 또는 에디터 관련 영역에 해당하면, THE Investigate_Power SHALL FE_Part_Mention으로 @creator_fe를 선택한다
4. WHEN 분석 대상 코드 경로가 소비자 영역에 해당하면, THE Investigate_Power SHALL FE_Part_Mention으로 @consumer_fe를 선택한다
5. WHEN 분석 대상 코드 경로가 크리에이터 영역과 소비자 영역 어디에도 해당하지 않으면, THE Investigate_Power SHALL FE_Part_Mention으로 @core_fe를 선택한다
6. IF 코드 경로와 Sentry 프로젝트 정보만으로 담당 파트를 판단할 수 없으면, THEN THE Investigate_Power SHALL 기본값으로 @core_fe를 FE_Part_Mention 대상으로 사용한다
8. IF 사용자가 슬랙 공유를 거부하면, THEN THE Investigate_Power SHALL 슬랙 게시를 건너뛰고 RCA_Report 내용을 채팅 응답으로만 제공한다
9. IF Slack_MCP를 통한 Slack_Thread_Reply 게시가 실패하면, THEN THE Investigate_Power SHALL 게시 실패 사유를 사용자에게 표시하고 RCA_Report 내용은 채팅 응답으로 대체 제공한다

### 요구사항 7: Steering 파일 구조 및 단계별 실행

**사용자 스토리:** 개발자로서, 분석이 명확한 단계별로 진행되길 원한다. 그래야 각 단계의 진행 상황을 파악하고 필요시 개입할 수 있다.

#### 인수 조건

1. THE Investigate_Power SHALL 다음 Steering_File 순서로 분석을 진행한다: phase1-sentry-context.md, phase2-code-analysis.md, phase3-report.md
2. WHEN 각 Steering_File 단계가 완료되면, THE Investigate_Power SHALL 해당 단계의 결과 요약을 사용자에게 표시한다
3. THE Investigate_Power SHALL Onboarding 단계에서 Slack_Thread_URL 유효성 검증, Slack_MCP 연결 확인, Sentry_MCP 연결 확인을 수행한다

### 요구사항 8: MCP 서버 설정 가이드

**사용자 스토리:** 개발자로서, 필요한 MCP 서버 설정 방법을 안내받고 싶다. 그래야 Power를 처음 사용할 때 빠르게 환경을 구성할 수 있다.

#### 인수 조건

1. WHEN Onboarding 단계에서 Slack_MCP가 연결되어 있지 않으면, THE Investigate_Power SHALL Slack_MCP 설정에 필요한 단계별 가이드를 제공한다
2. WHEN Onboarding 단계에서 Sentry_MCP가 연결되어 있지 않으면, THE Investigate_Power SHALL Sentry_MCP 설정에 필요한 단계별 가이드를 제공한다
3. THE Investigate_Power SHALL MCP 서버 설정 가이드에 Kiro IDE의 MCP 설정 파일 경로와 설정 예시를 포함한다