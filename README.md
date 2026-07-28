# AI 디자인 브리프 생성기 (팀 공용 · Vercel)

시즌·챕터/TPO·아이템·소재를 입력하면 디자인 방향, 소재, 실루엣, 컬러(스와치), 디테일,
경쟁 브랜드, 판매 포인트를 AI가 생성합니다. 편집·PDF 저장 지원. 브랜드 톤(크림/블랙/버건디·Urbanist).

## 구성

```
brief-web/
├─ index.html          프론트엔드 (그대로 배포되는 정적 페이지)
├─ api/generate.js     서버리스 함수 — 여기서만 API 키 사용 (브라우저 노출 없음)
├─ package.json
└─ README.md
```

## 배포 방법 (기존 대시보드와 동일한 Vercel 방식)

### 1) 프로젝트 올리기
- 이 `brief-web` 폴더를 GitHub 저장소에 올린 뒤 Vercel에서 **New Project → Import**,
  또는 Vercel CLI로 폴더에서 `vercel` 실행.
- 별도 빌드 설정 불필요 — 정적 `index.html` + `api/` 서버리스 함수를 Vercel이 자동 인식합니다.

### 2) 환경변수 설정 (필수)
Vercel → 프로젝트 → **Settings → Environment Variables** 에 추가:

| Key | Value | 비고 |
|-----|-------|------|
| `ANTHROPIC_API_KEY` | 회사 Anthropic API 키 | **필수.** 서버에만 저장되고 브라우저엔 노출 안 됨 |
| `CLAUDE_MODEL` | `claude-sonnet-5` | 선택. 저렴하게 쓰려면 `claude-haiku-4-5-20251001` |

환경변수 추가 후 **Redeploy** 한 번 해주세요(변수 적용).

### 3) 공유
배포 URL을 팀에 공유하면 끝. 각자 키 입력 없이 바로 사용합니다.

## 비용
- 생성 1건당 대략: Haiku 약 13원 / Sonnet 약 25원 (입력·출력 토큰 기준 추정).
- 호스팅은 Vercel 무료/기존 플랜으로 커버. 실제 비용은 **API 사용량**만 회사 키 청구서에 집계됩니다.

## 보안 메모
- API 키는 `api/generate.js`에서 **서버 환경변수로만** 사용됩니다. 코드·프론트에 키를 절대 하드코딩하지 마세요.
- 저장된 브리프 히스토리는 사용자 **브라우저 로컬**에 저장됩니다(개인별). 팀 공유 히스토리가 필요하면 DB(예: Vercel Postgres) 연동을 추가하면 됩니다 — 원하면 다음 단계로 만들어 드릴게요.

## 커스터마이즈
- 브랜드 컨텍스트·프롬프트: `api/generate.js` 상단 `BRAND` / `buildPrompt` 수정.
- 화면 톤·항목: `index.html`의 스타일과 카드 구성 수정.
