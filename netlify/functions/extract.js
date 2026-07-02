
import os
os.makedirs("/home/user/out/netlify/functions", exist_ok=True)
os.makedirs("/home/user/out/public", exist_ok=True)

# ============================================================
# (A) extract.js — 상대방 오추출 교정 (우리 회사=KBS미디어 제외 규칙 추가)
# ============================================================
extract_js = r'''// netlify/functions/extract.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { validate } from "./lib/validate.js";

const CONTRACT_SCHEMA = {
  type: "object",
  properties: {
    title:               { type: "string" },
    counterparty_name:   { type: "string" },
    counterparty_biz_no: { type: "string", nullable: true },
    start_date:          { type: "string", nullable: true },
    end_date:            { type: "string", nullable: true },
    auto_renewal:        { type: "boolean" },
    renewal_notice:      { type: "string", nullable: true }
  },
  required: ["title", "counterparty_name", "auto_renewal"]
};

// ★ 우리 회사명을 환경변수로 관리 (없으면 기본값 사용)
const OUR_COMPANY = process.env.OUR_COMPANY_NAME || "KBS미디어";

const RULES = `
너는 계약서 데이터 추출기다. 첨부된 계약서(PDF)를 읽고 아래 규칙을 반드시 지켜라.
- 원문에 명시된 값만 추출하라. 없으면 반드시 null. 절대 추측하지 마라.
- 날짜는 "YYYY-MM-DD"로 정규화하라. (예: 2020년 1월 29일 -> 2020-01-29)
- 계약 개시일이 명시 없으면 null.
- 계약 종료일이 "계약서 참조" 등으로 날짜가 없으면 null.
- 자동갱신 조항이 없으면 auto_renewal=false.
- renewal_notice에는 갱신 통보 기한 문구를 그대로 넣어라(예: "만료 30일 전"). 없으면 null.

[★ 계약 상대방(counterparty_name) 판정 규칙 — 매우 중요]
- 우리 회사는 "${OUR_COMPANY}" 이다. 우리 회사는 절대 계약 상대방이 아니다.
- 계약서에는 보통 두 당사자가 나온다: 우리 회사(${OUR_COMPANY})와, 그 외의 상대 회사.
- counterparty_name 에는 "${OUR_COMPANY}"가 아닌 '상대 회사명'을 넣어라.
- 만약 추출한 이름이 "${OUR_COMPANY}"와 같거나 매우 유사하면, 그것은 잘못이다.
  그 경우 계약서에서 우리 회사가 아닌 다른 당사자를 다시 찾아 그 회사명을 넣어라.
- 상대방을 특정할 수 없으면 counterparty_name 은 null 로 두어라(추측 금지).
`;

export default async (req) => {
  try {
    const { path } = await req.json();
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const { data: file, error } = await sb.storage.from("contracts").download(path);
    if (error) throw new Error("PDF 다운로드 실패: " + error.message);
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: CONTRACT_SCHEMA
      }
    });

    const result = await model.generateContent([
      { text: RULES },
      { inlineData: { mimeType: "application/pdf", data: base64 } }
    ]);

    const fields = JSON.parse(result.response.text());

    // ★ 안전장치: 그래도 우리 회사가 상대방으로 왔으면 경고 플래그
    let counterparty_warning = null;
    if (fields.counterparty_name) {
      const norm = (s) => s.replace(/[\s()（）㈜(주)]/g, "");
      if (norm(fields.counterparty_name).includes(norm(OUR_COMPANY))) {
        counterparty_warning = `상대방이 우리 회사(${OUR_COMPANY})로 추출됨 - 수동 확인 필요`;
      }
    }

    const validation = validate(fields);
    if (counterparty_warning) validation.warnings.push(counterparty_warning);

    return Response.json({ ok: true, path, fields, validation, our_company: OUR_COMPANY });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
};
'''

with open("/home/user/out/netlify/functions/extract.js", "w", encoding="utf-8") as f:
    f.write(extract_js)

print("extract.js 생성 완료:", len(extract_js), "bytes")
