import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { validate } from "./lib/validate.js";

// 계약 6필드 스키마 — Gemini가 이 JSON 모양으로만 답하게 강제
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

const RULES = `
너는 계약서 데이터 추출기다. 첨부된 계약서(PDF)를 읽고 아래 규칙을 반드시 지켜라.
- 원문에 명시된 값만 추출하라. 없으면 반드시 null. 절대 추측하지 마라.
- 날짜는 "YYYY-MM-DD"로 정규화하라. (예: 2020년 1월 29일 -> 2020-01-29)
- 계약 개시일이 명시 없으면 null.
- 계약 종료일이 "계약서 참조" 등으로 날짜가 없으면 null.
- 자동갱신 조항이 없으면 auto_renewal=false.
- renewal_notice에는 갱신 통보 기한 문구를 그대로 넣어라(예: "만료 30일 전"). 없으면 null.
- counterparty_name은 계약 상대방 회사명(우리 회사가 아닌 쪽).
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
    const validation = validate(fields);

    return Response.json({ ok: true, path, fields, validation });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
};
