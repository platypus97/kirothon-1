# Phase 1: Sentry 컨텍스트 수집

이 단계에서는 슬랙 스레드에서 Sentry 이슈 링크를 추출하고, Sentry MCP를 통해 에러 상세 정보를 수집한다. Phase 2(코드 분석)의 입력 데이터를 준비하는 단계이다.

---

## 1. Slack 스레드 메시지 읽기

### 1-1. Slack Thread URL 파싱

Onboarding 단계에서 검증된 Slack Thread URL에서 `channel_id`와 `thread_ts`를 추출한다.

URL 형식:
```
https://<workspace>.slack.com/archives/<channel_id>/p<timestamp>
```

파싱 규칙:

1. **`channel_id` 추출**: URL 경로에서 `/archives/` 바로 뒤의 세그먼트를 `channel_id`로 사용한다.
   - 예: `https://my-team.slack.com/archives/C01ABCDEF/p1234567890123456` → `channel_id` = `C01ABCDEF`

2. **`thread_ts` 추출**: URL 경로의 마지막 세그먼트인 `p<timestamp>` 부분에서 선행 `p`를 제거한 뒤, `<seconds>.<microseconds>` 형식으로 변환한다.
   - `p` 접두사를 제거한다.
   - 앞 10자리를 초(seconds)로, 나머지 뒷자리를 마이크로초(microseconds)로 분리한다.
   - 두 부분을 `.`으로 연결하여 `thread_ts`를 생성한다.
   - 예: `p1234567890123456` → `p` 제거 → `1234567890123456` → `1234567890` + `.` + `123456` → `thread_ts` = `1234567890.123456`

### 1-2. Slack MCP로 스레드 메시지 읽기

파싱된 `channel_id`와 `thread_ts`를 사용하여 Slack MCP를 통해 해당 스레드의 전체 메시지를 읽는다.

**지시사항:**

1. Slack MCP의 스레드 메시지 읽기 기능을 호출한다. 입력 파라미터:
   - `channel_id`: 위에서 파싱한 채널 ID
   - `thread_ts`: 위에서 파싱한 스레드 타임스탬프

2. 스레드의 **모든 메시지**를 가져온다. 페이지네이션이 있는 경우 모든 페이지를 순회하여 전체 메시지를 수집한다.

3. 각 메시지에서 다음 정보를 보존한다:
   - 메시지 텍스트 (본문)
   - 작성자 정보
   - 타임스탬프
   - 첨부 파일이나 링크 미리보기에 포함된 URL

4. 수집된 메시지 목록을 다음 단계(Sentry 이슈 링크 추출)의 입력으로 전달한다.

---

## 2. Sentry 이슈 링크 추출

### 2-1. 정규식 패턴

수집된 스레드 메시지에서 Sentry 이슈 링크를 추출한다. 다음 정규식 패턴을 사용한다:

```
https://[^/]+\.sentry\.io/issues/\d+
```

이 패턴은 `https://<organization>.sentry.io/issues/<issue_id>` 형식의 모든 Sentry 이슈 URL에 매칭된다.

### 2-2. 추출 범위 및 복수 링크 처리

**지시사항:**

1. 스레드의 **모든 메시지**에서 Sentry 이슈 링크를 추출한다. 첫 번째 매칭에서 멈추지 않고, 모든 메시지의 모든 매칭을 수집한다.

2. 각 메시지에서 다음 영역을 모두 검색한다:
   - 메시지 텍스트 (본문)
   - 첨부 파일 (attachments) 내 텍스트 및 URL 필드
   - 링크 미리보기 (unfurl) 에 포함된 URL

3. 동일한 Sentry 이슈 링크가 여러 메시지에 중복으로 등장할 수 있다. 추출된 링크 목록에서 **URL 기준으로 중복을 제거**하여 고유한 링크만 남긴다.

### 2-3. 링크 파싱

추출된 각 Sentry 이슈 링크에서 다음 정보를 파싱한다:

| 필드 | 설명 | 파싱 방법 |
|------|------|-----------|
| `issueUrl` | 원본 Sentry 이슈 URL 전체 | 정규식 매칭 결과 그대로 사용 |
| `organization` | Sentry 조직 슬러그 | URL 호스트에서 `.sentry.io` 앞부분 추출 (예: `https://my-org.sentry.io/issues/12345` → `my-org`) |
| `issue_id` | Sentry 이슈의 숫자 ID | URL 경로에서 `/issues/` 뒤의 숫자 추출 (예: `/issues/12345` → `12345`) |

**파싱 예시:**

```
입력 URL: https://my-org.sentry.io/issues/12345
→ issueUrl:      https://my-org.sentry.io/issues/12345
→ organization:  my-org
→ issue_id:      12345
```

```
입력 URL: https://acme-corp.sentry.io/issues/67890
→ issueUrl:      https://acme-corp.sentry.io/issues/67890
→ organization:  acme-corp
→ issue_id:      67890
```

4. 파싱된 결과를 리스트로 구성하여 다음 단계(Sentry MCP 이슈 상세 조회)의 입력으로 전달한다.


---

## 3. Sentry MCP 이슈 상세 조회

### 3-1. 이슈 상세 정보 조회

단계 2에서 추출된 각 Sentry 이슈에 대해 Sentry MCP를 통해 상세 정보를 조회한다.

**지시사항:**

1. 추출된 이슈 목록을 순회하며, 각 이슈에 대해 Sentry MCP의 `get_issue_details` 기능을 호출한다. 입력 파라미터:
   - `issueUrl`: 단계 2-3에서 파싱한 원본 Sentry 이슈 URL 전체
   - `organizationSlug`: 단계 2-3에서 파싱한 organization 값

2. 각 이슈에서 다음 정보를 수집한다:

   | 수집 항목 | 설명 | 응답 필드 |
   |-----------|------|-----------|
   | 스택트레이스 | 에러 발생 시점의 호출 스택 프레임 목록 | stacktrace / exception entries |
   | 최근 이벤트 상세 | 가장 최근에 발생한 이벤트의 컨텍스트, 요청 정보 등 | latestEvent |
   | 태그 정보 | 브라우저, OS, 환경, 릴리즈 등 태그 키-값 쌍 | tags |
   | 발생 횟수 | 해당 이슈의 총 이벤트 수 | count |
   | 최초 발생 시간 | 이슈가 처음 감지된 시간 (ISO 8601) | firstSeen |
   | 최근 발생 시간 | 이슈가 마지막으로 발생한 시간 (ISO 8601) | lastSeen |
   | 영향받는 사용자 수 | 이 이슈로 영향받은 고유 사용자 수 | userCount |

3. 여러 이슈가 있는 경우, **모든 이슈에 대해 각각** 상세 조회를 수행한다. 하나의 이슈 조회 결과를 받은 후 다음 이슈를 조회한다.

### 3-2. 스택트레이스 파싱 — 소스 파일 경로 및 라인 번호 추출

조회된 이슈 상세 정보에서 스택트레이스 프레임을 파싱하여 코드 분석 대상 파일 목록을 생성한다.

**지시사항:**

1. 스택트레이스의 각 프레임에서 다음 정보를 추출한다:
   - `filename`: 소스 파일 경로
   - `lineNo`: 라인 번호
   - `colNo`: 컬럼 번호
   - `function`: 함수명
   - `inApp`: 앱 코드 여부 (boolean)

2. **inApp 프레임 우선 정렬**: 추출된 프레임 목록을 다음 우선순위로 정렬한다:
   - **1순위**: `inApp: true`인 프레임 (애플리케이션 코드)
   - **2순위**: `inApp: false`인 프레임 (라이브러리, node_modules 등 외부 코드)

3. `inApp: true`인 프레임만으로 코드 분석 대상 파일 목록을 구성한다. `inApp: false`인 프레임은 참고용으로만 보존하고, Phase 2 코드 분석의 직접적인 대상에서는 제외한다.

4. 동일한 파일 경로가 여러 프레임에 등장할 수 있다. 파일 경로 기준으로 중복을 제거하되, 각 파일에 대해 관련된 모든 라인 번호와 함수명을 함께 기록한다.

**파싱 결과 형식 (이슈별):**

```
이슈: <issueUrl>
에러 타입: <title>
발생 횟수: <count>회 | 영향 사용자: <userCount>명
최초 발생: <firstSeen> | 최근 발생: <lastSeen>

[분석 대상 파일 — inApp 프레임]
1. <filename> (line <lineNo>) — <function>
2. <filename> (line <lineNo>) — <function>
...

[참고 — 외부 라이브러리 프레임]
1. <filename> (line <lineNo>) — <function>
...
```

### 3-3. 에러 처리 — Sentry MCP 조회 실패

Sentry MCP를 통한 이슈 조회가 실패할 수 있다. 실패 시 다음 절차를 따른다.

**지시사항:**

1. Sentry MCP `get_issue_details` 호출이 실패하면 (네트워크 오류, 권한 부족, 이슈 미존재 등), 다음 정보를 기록한다:
   - **실패한 이슈 URL**: 조회를 시도한 Sentry 이슈 링크
   - **실패 사유**: MCP가 반환한 에러 메시지 또는 실패 원인 설명

2. 실패 기록 형식:

   ```
   ⚠️ Sentry 이슈 조회 실패
   - 이슈 URL: <issueUrl>
   - 실패 사유: <에러 메시지 또는 원인>
   ```

3. 이슈 조회가 실패하면 **즉시 분석을 중단**한다. 남은 이슈가 있더라도 추가 조회를 시도하지 않는다.

4. 사용자에게 조회 실패 사실을 알리고, 다음을 안내한다:
   - Sentry MCP 연결 상태 재확인 필요
   - 해당 Sentry 이슈에 대한 접근 권한 확인 필요
   - 이슈 URL이 올바른지 확인 필요


---

## 4. Phase 1 결과 요약

Phase 1의 모든 단계가 완료되면, 수집된 Sentry 컨텍스트를 사용자에게 요약하여 표시한다. 이 요약은 Phase 2(코드 분석) 진행 전에 사용자가 수집 결과를 확인할 수 있도록 하기 위함이다.

**지시사항:**

1. 아래 템플릿 형식에 따라 Phase 1 결과 요약을 사용자에게 출력한다.
2. 모든 이슈의 정보를 빠짐없이 포함한다.
3. 조회 실패한 이슈가 있으면 별도 섹션으로 표시한다.

**출력 템플릿:**

```
📋 Phase 1 완료 — Sentry 컨텍스트 수집 결과

총 추출된 Sentry 이슈: <총 이슈 수>건

---

### 이슈 #<번호>
- 🔗 링크: <issueUrl>
- 🏷️ 에러 타입: <title>
- 📊 발생 횟수: <count>회
- 👥 영향 사용자: <userCount>명
- 🕐 최초 발생: <firstSeen>
- 🕐 최근 발생: <lastSeen>

**분석 대상 파일 (inApp 프레임):**
1. `<filename>` (line <lineNo>) — `<function>`
2. `<filename>` (line <lineNo>) — `<function>`
...

(이슈가 여러 개인 경우 위 블록을 이슈마다 반복)

---

### Phase 2 코드 분석 대상 파일 목록 (전체)

모든 이슈에서 추출된 inApp 프레임의 고유 파일 경로를 통합하여 표시한다:

1. `<filename>`
2. `<filename>`
...

총 분석 대상 파일: <고유 파일 수>개

---

(조회 실패한 이슈가 있는 경우에만 아래 섹션을 표시)

### ⚠️ 조회 실패 이슈

| 이슈 URL | 실패 사유 |
|-----------|-----------|
| <issueUrl> | <에러 메시지 또는 원인> |
```

4. 요약 출력 후, Phase 2(코드 분석) 단계로 진행한다.
