extract_js = '''// netlify/functions/extract.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { validate } from "./lib/validate.js";

const OUR_COMPANY = process.env.OUR_COMPANY_NAME || "KBS미디어(주)";

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

const RULES = `
너는 계약서 데이터 추출기다. 첨부된 계약서(PDF)를 읽고 아래 규칙을 반드시 지켜라.
- 우리 회사는 "${OUR_COMPANY}" 이다. 우리 회사는 절대 계약 상대방이 아니다.
- counterparty_name 에는 우리 회사가 아닌 '상대 회사명'을 넣어라.
- 추출한 상대방이 우리 회사와 같거나 유사하면 잘못이므로, 다른 당사자를 다시 찾아라.
- 상대방을 특정할 수 없으면 counterparty_name 은 null (추측 금지).
- 원문에 명시된 값만 추출하라. 없으면 반드시 null. 절대 추측하지 마라.
- 날짜는 "YYYY-MM-DD"로 정규화하라. (예: 2020년 1월 29일 -> 2020-01-29)
- 계약 개시일이 명시 없으면 null.
- 계약 종료일이 "계약서 참조" 등으로 날짜가 없으면 null.
- 자동갱신 조항이 없으면 auto_renewal=false.
- renewal_notice 에는 갱신 통보 기한 문구를 그대로 넣어라(예: "만료 30일 전"). 없으면 null.
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
      generationConfig: { responseMimeType: "application/json", responseSchema: CONTRACT_SCHEMA }
    });

    const result = await model.generateContent([
      { text: RULES },
      { inlineData: { mimeType: "application/pdf", data: base64 } }
    ]);

    const fields = JSON.parse(result.response.text());

    // 2중 안전장치: 그래도 우리 회사가 상대방으로 오면 경고
    const validation = validate(fields);
    if (fields.counterparty_name && OUR_COMPANY &&
        fields.counterparty_name.replace(/[()\\s㈜（）]/g, "").includes(OUR_COMPANY.replace(/[()\\s㈜（）]/g, "").slice(0, 4))) {
      validation.warnings.push("상대방이 우리 회사로 추출됨 - 수동 확인 필요");
    }

    return Response.json({ ok: true, path, fields, validation });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
};
'''

with open("/home/user/out/netlify/functions/extract.js", "w", encoding="utf-8") as f:
    f.write(extract_js)

# 검증
el = extract_js.splitlines()
print("=== extract.js 첫 2줄 ===")
print("\n".join(el[:2]))
print("=== 마지막 2줄 ===")
print("\n".join(el[-2:]))
print("Python 흔적:", "index_html" in extract_js, "zipfile" in extract_js)

# zip 묶기
import zipfile
zpath = "/home/user/contract-trial-v2.zip"
with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
    z.write("/home/user/out/netlify/functions/extract.js", "extract.js")
    z.write("/home/user/out/public/index.html", "index.html")
print("zip 완료")
