# 배포 가이드

## 사전 준비

- AWS CLI 설치 및 설정 (`aws configure`)
- SAM CLI 설치 (`brew install aws-sam-cli`)
- Node.js 20.x

## Step 1: Slack App 생성

1. https://api.slack.com/apps → "Create New App" → "From scratch"
2. App Name: `Analysis Bot`, Workspace 선택
3. 좌측 메뉴 "OAuth & Permissions" → Bot Token Scopes 추가:
   - `app_mentions:read`
   - `chat:write`
4. "Install to Workspace" 클릭 → Bot User OAuth Token (`xoxb-...`) 복사
5. 좌측 메뉴 "Event Subscriptions" → Enable Events: ON
   - Request URL은 Step 2 이후에 설정 (아직 비워두기)
   - Subscribe to bot events: `app_mention` 추가

## Step 2: Lambda 배포

```bash
# 빌드
npm install
npm run build

# SAM 배포 (처음 한번)
sam build
sam deploy --guided
```

`sam deploy --guided` 실행 시 파라미터 입력:
- **Stack Name**: sentry-slack-analysis-bot
- **Region**: ap-northeast-2 (또는 원하는 리전)
- **SlackBotToken**: Step 1에서 복사한 xoxb-... 토큰
- **BedrockAgentId**: placeholder (Step 4에서 업데이트)
- **BedrockAgentAliasId**: placeholder (Step 4에서 업데이트)

배포 완료 후 출력되는 `SlackEventUrl`을 복사해두세요.

## Step 3: Slack Event URL 등록

1. Slack App 설정 → "Event Subscriptions"
2. Request URL에 Step 2의 `SlackEventUrl` 붙여넣기
3. "Verified" 표시 확인 (url_verification 챌린지 자동 통과)
4. 변경사항 저장

## Step 4: Bedrock Agent 생성

1. AWS 콘솔 → Amazon Bedrock → Agents → "Create Agent"
2. Agent 설정:
   - 이름: `sentry-analysis-agent`
   - 모델: Claude 3.5 Sonnet (또는 원하는 모델)
   - Instructions에 장애 분석 프롬프트 작성
3. MCP 서버 연결 (Action Groups):
   - Sentry API 연결
   - CloudWatch Logs 조회
   - S3 소스코드 조회
4. Agent 생성 후 Alias 생성
5. Agent ID와 Alias ID 메모

## Step 5: Lambda 환경변수 업데이트

```bash
sam deploy \
  --parameter-overrides \
    SlackBotToken=xoxb-your-token \
    BedrockAgentId=실제-agent-id \
    BedrockAgentAliasId=실제-alias-id
```

## Step 6: Sentry Alert 설정

1. Sentry → Alerts → "Create Alert Rule"
2. Action에서 Slack 알림 선택
3. 메시지 템플릿에 `@Analysis Bot` 멘션 포함
4. 알림 채널 지정

## 테스트

Slack 채널에서 Sentry 알림이 오면 자동으로 분석이 시작됩니다.
수동 테스트: 채널에서 `@Analysis Bot https://api.example.com/test TypeError test error` 입력
