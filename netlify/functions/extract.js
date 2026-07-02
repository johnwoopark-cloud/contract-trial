// netlify/functions/extract.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { validate } from "./lib/validate.js";

const CONTRACT_SCHEMA = {
  type: "object",
  properties: {
    title:               { type: "string" },
    counterparty_name:   { type: "string", nullable: true },
    counterparty_biz_no: { type: "string", nullable: true },
    start_date:          { type: "string", nullable: true },
    end_date:            { type: "string", nullable: true },
    auto_renewal:        { type: "boolean" },
    renewal_notice:      { type: "string", nullable: true }
  },
  required: ["title", "auto_renewal"]
};

export default async (req) => {
  try {
    const { path } = await req.json();
    const OUR = process.env.OUR_COMPANY_NAME || "KBS미디어(주)";

    const rules =
      "너는 계약서 데이터 추출기다. 첨부된 계약서(PDF)를 읽고 아래 규칙을 반드시 지켜라.\n" +
      "- 원문에 명시된 값만 추출하라. 없으면 반드시 null. 절대 추측하지 마라.\n" +
      "- 날짜는 \"YYYY-MM-DD\" 형식으로 정규화하라. (예: 2026년 4월 30일 -> 2026-04-30)\n" +
      "- 계약 개시일이 명시 없으면 null.\n" +
      "- 계약 종료일이 \"계약서 참조\" 등으로 날짜가 없으면 null.\n" +
      "- 자동갱신 조항이 없으면 auto_renewal=false.\n" +
      "- renewal_notice에는 갱신 통보 기한 문구를 그대로 넣어라(예: \"만료 30일 전\"). 없으면 null.\n" +
      "- 우리 회사는 \"" + OUR + "\" 이다. 우리 회사는 절대 계약 상대방이 아니다.\n" +
      "- counterparty_name 에는 우리 회사가 아닌 '상대 회사명'을 넣어라.\n" +
      "- 추출한 상대방이 우리 회사와 유사하면 잘못이므로, 다른 당사자를 다시 찾아라.\n" +
      "- 상대방을 특정하지 못하면 null 로 두어라(추측 금지).";

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // 1) Storage에서 PDF 다운로드
    const { data: file, error } = await sb.storage.from("contracts").download(path);
    if (error) throw new Error("PDF 다운로드 실패: " + error.message);
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

    // 2) Gemini에 PDF를 그대로 전달
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: CONTRACT_SCHEMA
      }
    });

    const result = await model.generateContent([
      { text: rules },
      { inlineData: { mimeType: "application/pdf", data: base64 } }
    ]);

    const fields = JSON.parse(result.response.text());

    // 3) 형식 검증
    const validation = validate(fields);

    // 4) 상대방이 우리 회사로 잘못 왔는지 2차 감지
    if (fields.counterparty_name &&
        fields.counterparty_name.replace(/\s/g, "").includes(OUR.replace(/$주$|\s/g, ""))) {
      validation.warnings.push("계약 상대방이 우리 회사로 추출되었을 수 있습니다. 수동 확인 필요.");
    }

    return Response.json({ ok: true, path, fields, validation });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
};
