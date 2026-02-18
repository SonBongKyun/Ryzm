# Ryzm Terminal — Deploy Checklist v1.0

## Pre-Deploy: 환경 설정

- [ ] `.env` 파일 생성 (`.env.example`에서 복사)
- [ ] `JWT_SECRET` — 최소 64자 랜덤 문자열로 변경
- [ ] `ADMIN_TOKEN` — 강력한 토큰으로 변경
- [ ] `GENAI_API_KEY` — Google AI API 키 설정
- [ ] `APP_BASE_URL` / `SITE_URL` — 실제 도메인으로 설정
- [ ] `ALLOWED_ORIGINS` — CORS 허용 도메인 설정

## Stripe 결제 설정

- [ ] Stripe Dashboard에서 Product/Price 생성 (월 구독)
- [ ] `STRIPE_SECRET_KEY` — 라이브 키 설정 (테스트 시 `sk_test_...`)
- [ ] `STRIPE_PRICE_ID_PRO` — Price ID 설정
- [ ] Stripe Webhook Endpoint 등록: `https://도메인/api/payments/webhook`
- [ ] Webhook 수신 이벤트 선택:
  - `checkout.session.completed`
  - `invoice.paid`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- [ ] `STRIPE_WEBHOOK_SECRET` — Webhook signing secret 설정
- [ ] Stripe Customer Portal 활성화 (Settings → Billing → Customer Portal)

## Stripe 결제 테스트 시나리오

- [ ] 테스트 카드 `4242 4242 4242 4242`로 결제 → 즉시 Pro 확인
- [ ] 새로고침 후에도 Pro 유지 확인
- [ ] Manage Subscription → Stripe Portal 열리는지 확인
- [ ] Portal에서 구독 해지 → Free로 자동 전환 확인
- [ ] 결제 실패 테스트 카드 `4000 0000 0000 0341` → 적절한 오류 처리 확인

## Free 한도 테스트

- [ ] Council 10회 초과 → 403 + 업그레이드 모달
- [ ] Validator 3회 초과 → 403 + 업그레이드 모달
- [ ] Chat 20회 초과 → 403 + 업그레이드 모달
- [ ] Alert 5개 초과 → 403 + 업그레이드 모달

## 인증 테스트

- [ ] 미로그인 상태에서 유료 기능 → 401 → 로그인 모달
- [ ] 회원가입 → 이메일 인증 메일 발송 확인
- [ ] 로그인 → 새로고침 → 로그인 유지 확인
- [ ] 로그아웃 → 로그인 상태 완전 초기화

## 헬스체크 & 모니터링

- [ ] `GET /health` — 200 OK + version/uptime 확인
- [ ] `GET /api/health-check` — 데이터 소스 상태 확인
- [ ] UptimeRobot/Better Uptime에 `/health` 모니터 등록 (5분 간격)
- [ ] (선택) Sentry DSN 설정하여 에러 트래킹 활성화

## 정적 파일 확인

- [ ] `GET /static/styles.css` — 200 OK
- [ ] `GET /static/js/api.js` — 200 OK
- [ ] `GET /static/js/chart.js` — 200 OK
- [ ] `GET /service-worker.js` — 200 OK
- [ ] `GET /manifest.json` — 200 OK
- [ ] 브라우저 콘솔 에러 0개

## 기능 킬스위치 (장애 대비)

- [ ] `ENABLE_COUNCIL=false` 설정 시 503 응답 확인
- [ ] `ENABLE_CHAT=false` 설정 시 503 응답 확인
- [ ] `ENABLE_VALIDATOR=false` 설정 시 503 응답 확인

## 베타 모드 (선택)

- [ ] `BETA_INVITE_CODE=my-secret-code` 설정
- [ ] 회원가입 시 초대 코드 입력 필드 노출 확인
- [ ] 잘못된 코드 입력 시 403 거부 확인
- [ ] 정확한 코드 입력 시 정상 가입 확인

## 배포 방식 (Render 기준)

- [ ] Build Command: `pip install -r requirements.txt`
- [ ] Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- [ ] Environment Variables: `.env.example` 기반으로 모두 설정
- [ ] (선택) Render Postgres 연결 — `DATABASE_URL` 설정
- [ ] Custom Domain 연결 + TLS 인증서 확인
- [ ] 배포 후 `https://도메인/health` 응답 확인

## 업데이트 배포 시 체크

1. `index.html`의 CSS/JS `?v=` 버전 올리기
2. `service-worker.js`의 `CACHE_NAME`/`API_CACHE_NAME` 버전 올리기
3. Push → 자동 배포 완료 확인
4. 시크릿 모드에서 변경사항 반영 확인

## 1인 운영 매일 루틴 (10분)

1. 업타임 알림 확인 (health-check)
2. Stripe 결제 이벤트 확인 (실패/환불/해지)
3. 서버 로그에서 500 에러 확인
4. AI API 비용 확인

## 장애 대응

- **500 에러 폭증** → 킬스위치로 AI 기능 잠시 비활성화
- **Stripe 웹훅 실패** → Stripe Dashboard에서 재전송
- **외부 데이터 소스 장애** → 캐시된 데이터로 자동 degraded 모드
- **비용 폭주** → `ENABLE_*=false`로 즉시 차단
