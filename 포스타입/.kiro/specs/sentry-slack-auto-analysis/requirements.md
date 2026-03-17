# 요구사항 문서

## 소개

장애 대응 시 원인 분석과 대응 속도를 향상시키기 위한 자동 분석 봇 시스템이다. Sentry에서 오류 알림이 발생하면 Sentry_Alert가 Slack 채널에 메시지를 게시하면서 자동으로 Analysis_Bot을 멘션한다. Analysis_Bot은 해당 멘션을 감지하여 관련 데이터를 수집하고 분석한 뒤, 장애 원인 요약을 Slack 스레드에 전달한다. 전체 흐름은 Sentry 알림 → Sentry_Alert가 Slack에 게시(@Analysis_Bot 자동 멘션 포함) → Lambda → Bedrock Agent(MCP 기반 데이터 수집) → LLM 요약 → Slack 스레드 응답으로 구성된다.

## 용어 정의

- **Analysis_Bot**: Slack 워크스페이스에서 동작하며, 멘션 이벤트를 수신하고 분석 결과를 Slack 스레드에 전송하는 봇
- **Mention_Receiver_Lambda**: Slack 멘션 이벤트를 POST 요청으로 수신하는 AWS Lambda 함수
- **Bedrock_Agent**: AWS Bedrock 기반 에이전트로, MCP를 사용하여 CloudWatch, Sentry, S3 소스코드를 수집하고 LLM으로 요약을 생성하는 컴포넌트
- **MCP**: Model Context Protocol. Bedrock Agent가 외부 데이터 소스에 접근하기 위해 사용하는 프로토콜
- **Sentry_Alert**: Sentry에서 발생하는 오류 알림 이벤트. Slack 채널에 메시지를 게시할 때 @Analysis_Bot 멘션을 자동으로 포함하도록 설정된다. 알림 메시지 본문에는 오류를 유발한 문제 URL(오류가 발생한 API 엔드포인트 URL 또는 페이지 URL), 오류 유형, 오류 메시지, 그리고 @Analysis_Bot 멘션이 포함된다. 문제 URL은 Sentry 이슈 URL이 아니라, 실제 오류가 발생한 서비스의 URL이다
- **Problem_URL**: Sentry 알림 메시지 본문에 포함된, 오류를 유발한 실제 서비스의 URL. Sentry 이슈 URL이나 Sentry 대시보드 URL과는 다르며, 오류가 발생한 API 엔드포인트 URL 또는 페이지 URL을 의미한다
- **Slack_Thread**: Sentry 알림 메시지 하위에 생성되는 Slack 스레드
- **CloudWatch_Logs**: AWS CloudWatch에 저장된 애플리케이션 로그 데이터
- **Source_Code_Repository**: S3 버킷에 저장된 애플리케이션 소스코드

## 요구사항

### 요구사항 1: Slack 멘션 이벤트 수신

**사용자 스토리:** 장애 대응 담당자로서, Sentry 알림이 Slack 채널에 게시될 때 자동으로 Analysis_Bot이 멘션되어 별도 조작 없이 분석이 시작되길 원한다.

#### 인수 조건

1. WHEN Sentry_Alert가 Slack 채널에 게시되면서 Analysis_Bot을 자동으로 멘션하면, THE Analysis_Bot SHALL 해당 멘션 이벤트를 감지하고 Mention_Receiver_Lambda에 POST 요청을 전송한다
2. WHEN 멘션 이벤트가 수신되면, THE Mention_Receiver_Lambda SHALL 해당 요청을 3초 이내에 수신 확인(ACK) 응답한다
3. THE Mention_Receiver_Lambda SHALL 멘션 이벤트에서 Slack 채널 ID, 스레드 타임스탬프, 멘션 메시지 텍스트를 추출한다
4. IF 멘션 이벤트에 유효한 Slack 채널 ID 또는 스레드 타임스탬프가 누락되면, THEN THE Mention_Receiver_Lambda SHALL 해당 요청을 무시하고 오류 로그를 기록한다

### 요구사항 2: Sentry 알림 메시지 내 문제 URL 파싱

**사용자 스토리:** 장애 대응 담당자로서, Sentry 알림 메시지 본문에 포함된 문제 URL(실제 오류가 발생한 서비스의 API 엔드포인트 URL 또는 페이지 URL)을 자동으로 추출하여 분석에 활용하고 싶다. 이 URL은 Sentry 이슈 URL이나 이슈 ID가 아니라, Sentry가 감지한 오류를 유발한 실제 서비스 URL이다.

#### 인수 조건

1. WHEN Mention_Receiver_Lambda가 멘션 이벤트를 수신하면, THE Mention_Receiver_Lambda SHALL Sentry 알림 메시지 본문에서 오류를 유발한 문제 URL(실제 서비스의 API 엔드포인트 URL 또는 페이지 URL), 오류 유형, 오류 메시지를 추출한다
2. THE Mention_Receiver_Lambda SHALL Sentry 알림 메시지에서 추출하는 문제 URL을 Sentry 이슈 URL이나 Sentry 대시보드 URL과 구분하여, 오류가 발생한 실제 서비스 URL만 추출한다
3. IF Sentry 알림 메시지 본문에서 문제 URL을 추출할 수 없으면, THEN THE Analysis_Bot SHALL Slack_Thread에 "Sentry 알림에서 문제 URL 정보를 찾을 수 없습니다"라는 안내 메시지를 전송한다

### 요구사항 3: Bedrock Agent 호출

**사용자 스토리:** 장애 대응 담당자로서, Sentry_Alert가 Analysis_Bot을 자동 멘션하면 장애 분석 에이전트가 즉시 호출되어 분석이 시작되길 원한다.

#### 인수 조건

1. WHEN Mention_Receiver_Lambda가 문제 URL 정보를 성공적으로 추출하면, THE Mention_Receiver_Lambda SHALL Bedrock_Agent를 비동기로 호출한다
2. THE Mention_Receiver_Lambda SHALL Bedrock_Agent 호출 시 오류를 유발한 문제 URL, 오류 유형, 오류 메시지, Slack 채널 ID, 스레드 타임스탬프를 전달한다
3. WHEN Bedrock_Agent 호출이 시작되면, THE Analysis_Bot SHALL Slack_Thread에 "분석을 시작합니다..." 상태 메시지를 전송한다
4. IF Bedrock_Agent 호출이 실패하면, THEN THE Analysis_Bot SHALL Slack_Thread에 "분석 에이전트 호출에 실패했습니다. 잠시 후 다시 시도해주세요."라는 오류 메시지를 전송한다

### 요구사항 4: MCP 기반 데이터 수집

**사용자 스토리:** 장애 대응 담당자로서, 장애 원인 분석에 필요한 Sentry 오류 상세, CloudWatch 로그, 관련 소스코드를 자동으로 수집하고 싶다.

#### 인수 조건

1. WHEN Bedrock_Agent가 호출되면, THE Bedrock_Agent SHALL MCP를 사용하여 Sentry API에서 전달받은 문제 URL 및 오류 유형으로 관련 이슈를 검색하고, 오류 상세 정보(스택트레이스, 오류 메시지, 발생 빈도, 영향받는 사용자 수)를 수집한다
2. WHEN Bedrock_Agent가 호출되면, THE Bedrock_Agent SHALL MCP를 사용하여 CloudWatch_Logs에서 전달받은 문제 URL을 기준으로 오류 발생 시점 전후 5분간의 관련 로그를 수집한다
3. WHEN Bedrock_Agent가 호출되면, THE Bedrock_Agent SHALL MCP를 사용하여 Source_Code_Repository(S3)에서 스택트레이스에 포함된 파일의 소스코드를 수집한다
4. IF Sentry API 접근에 실패하면, THEN THE Bedrock_Agent SHALL 수집 가능한 나머지 데이터 소스에서 데이터를 계속 수집하고, Sentry 데이터 수집 실패를 분석 결과에 명시한다
5. IF CloudWatch_Logs 접근에 실패하면, THEN THE Bedrock_Agent SHALL 수집 가능한 나머지 데이터 소스에서 데이터를 계속 수집하고, CloudWatch 데이터 수집 실패를 분석 결과에 명시한다
6. IF Source_Code_Repository 접근에 실패하면, THEN THE Bedrock_Agent SHALL 수집 가능한 나머지 데이터 소스에서 데이터를 계속 수집하고, 소스코드 수집 실패를 분석 결과에 명시한다

### 요구사항 5: LLM 기반 장애 원인 분석 및 요약

**사용자 스토리:** 장애 대응 담당자로서, 수집된 데이터를 기반으로 장애 원인과 대응 방안을 요약한 분석 결과를 받고 싶다.

#### 인수 조건

1. WHEN Bedrock_Agent가 데이터 수집을 완료하면, THE Bedrock_Agent SHALL 수집된 데이터를 LLM에 전달하여 장애 원인 분석 요약을 생성한다
2. THE Bedrock_Agent SHALL 분석 요약에 다음 항목을 포함한다: 오류 요약, 추정 원인, 관련 코드 위치, 영향 범위, 권장 대응 방안
3. IF 수집된 데이터가 분석에 충분하지 않으면, THEN THE Bedrock_Agent SHALL 분석 가능한 범위 내에서 요약을 생성하고, 추가 조사가 필요한 영역을 명시한다

### 요구사항 6: Slack 스레드 응답 전송

**사용자 스토리:** 장애 대응 담당자로서, 분석 결과를 Sentry 알림이 있는 Slack 스레드에서 바로 확인하고 싶다.

#### 인수 조건

1. WHEN Bedrock_Agent가 분석 요약 생성을 완료하면, THE Analysis_Bot SHALL 해당 분석 결과를 원래 멘션이 발생한 Slack_Thread에 전송한다
2. THE Analysis_Bot SHALL 분석 결과를 Slack Block Kit 형식으로 구조화하여 가독성을 확보한다
3. IF Slack 메시지 전송에 실패하면, THEN THE Analysis_Bot SHALL 최대 3회까지 재시도한다
4. IF 3회 재시도 후에도 Slack 메시지 전송에 실패하면, THEN THE Analysis_Bot SHALL 전송 실패를 CloudWatch_Logs에 기록한다

### 요구사항 7: 분석 처리 시간 제한

**사용자 스토리:** 장애 대응 담당자로서, 분석 결과를 적절한 시간 내에 받아 빠른 장애 대응에 활용하고 싶다.

#### 인수 조건

1. WHEN 분석이 시작되면, THE Bedrock_Agent SHALL 전체 분석 과정(데이터 수집 + 요약 생성)을 120초 이내에 완료한다
2. IF 분석 과정이 120초를 초과하면, THEN THE Analysis_Bot SHALL Slack_Thread에 "분석 시간이 초과되었습니다. 수집된 데이터 범위 내에서 부분 결과를 제공합니다."라는 메시지와 함께 부분 분석 결과를 전송한다

### 요구사항 8: 인증 및 보안

**사용자 스토리:** 시스템 관리자로서, 봇이 안전하게 외부 서비스에 접근하고 인증 정보가 보호되길 원한다.

#### 인수 조건

1. THE Mention_Receiver_Lambda SHALL Slack 요청의 서명(Signing Secret)을 검증하여 유효한 Slack 요청만 처리한다
2. THE Mention_Receiver_Lambda SHALL Sentry API 토큰, Slack Bot 토큰을 AWS Secrets Manager에서 조회하여 사용한다
3. IF Slack 요청 서명 검증에 실패하면, THEN THE Mention_Receiver_Lambda SHALL 해당 요청을 거부하고 HTTP 401 응답을 반환한다
