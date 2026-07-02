# contract-trial

계약서 AI 추출 시범 (GitHub + Netlify + Supabase + Gemini)

## 배포 전 교체할 값
1. `public/index.html` 상단의 `SUPABASE_URL`, `SUPABASE_ANON_KEY` → 본인 값
2. Netlify 환경변수 3개:
   - `GEMINI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`  (service_role 키, 절대 코드에 넣지 말 것)

## 구조
- public/index.html : 업로드·추출·비교·저장 화면
- netlify/functions/extract.js : PDF → Gemini → 계약 6필드 JSON
- netlify/functions/save.js : 검증 통과분만 Supabase 저장
- netlify/functions/lib/validate.js : 공용 검증 로직
