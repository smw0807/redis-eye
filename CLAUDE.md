# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 작업 전제 조건

**소스 수정 요청은 반드시 개발 서버가 구동 중일 때만 반영한다.**
`npm run dev`로 Express 서버(포트 3000)와 Vite 개발 서버(포트 5173)가 모두 실행 중인 상태여야 한다.
구동 중이 아니라면 먼저 실행을 요청하거나 직접 시작한 후 작업한다.

## 명령어

```bash
# 개발 모드 (Express + Vite 동시 실행, 핫리로드)
npm run dev

# 프로덕션 빌드 (vue-tsc 타입 체크 → vite build → dist/)
npm run build

# 프로덕션 실행
npm start        # node bin/cli.js 와 동일
```

빌드 결과물은 `dist/`(gitignore됨)에 생성되며, 프로덕션에서 Express가 이를 정적 파일로 서빙한다.

## 아키텍처

개발 시 두 프로세스, 프로덕션 시 단일 프로세스로 동작한다.

- **`bin/cli.js`** — npx 진입점. 포트 3000~3010을 순서대로 탐색해 사용 가능한 포트에 Express를 기동하고 브라우저를 자동으로 연다.
- **`server/index.js`** — Express 앱. `/api` 하위에 모든 라우트를 마운트하고, `dist/`를 정적 파일로 서빙하며 나머지 경로는 SPA 폴백으로 처리한다.
- **`server/redis.js`** — ioredis 싱글톤. `connect()`, `disconnect()`, `getClient()`, `isConnected()`를 export한다. 모든 라우트가 이 모듈을 통해 클라이언트를 사용한다.
- **`server/routes/`** — 라우트 그룹별 파일: `connect.js`, `keys.js`, `key.js`, `db.js`, `info.js`.
- **`app/`** — 별도 Vite+Vue3 프로젝트. 개발 시 Vite(5173)가 `/api` 요청을 Express(3000)로 프록시한다. 프로덕션에서는 빌드 결과물을 Express가 직접 서빙한다.

### 키 URL 인코딩

`GET /api/key/:id` — 키 이름에 슬래시 등 특수문자가 포함될 수 있으므로 **base64url로 인코딩**해서 URL에 담는다.
- 서버: `Buffer.from(id, 'base64url').toString('utf8')`로 디코딩
- 프론트엔드: `btoa(key).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')`로 인코딩

### Redis 제약사항

- `KEYS` 명령어 사용 금지 — 항상 `SCAN` 사용 (`routes/keys.js`)
- Express는 `127.0.0.1`에만 바인딩 (`0.0.0.0` 금지)
- 조회 시 최대 500개로 제한 (SCAN count, 타입별 값 목록 모두 동일)

### 프론트엔드 상태 관리

- 연결 프로필은 `localStorage`에 저장 (키: `redis-eye-profiles`)
- 상태 관리 라이브러리 없음 — 컴포넌트별 `ref`/`reactive` 사용
- Vue Router 네비게이션 가드: `/dashboard` 진입 전 `GET /api/status`를 호출해 미연결 시 `/`로 리다이렉트

### CSS

글로벌 다크 테마 변수는 `app/src/style.css`에 정의되어 있다. CSS 프레임워크 없이 CSS 변수만 사용한다. 타입 배지 색상(`--type-string`, `--type-hash` 등)은 CSS 변수로 정의되며 `TypeBadge.vue`에서 `color-mix()`로 적용한다.
