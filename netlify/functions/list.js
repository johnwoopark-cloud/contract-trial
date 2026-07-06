import { createClient } from "@supabase/supabase-js";

// netlify/functions/list.js
// 저장된 계약을 조회. 저장(save)과 마찬가지로 service 키를 써서 RLS와 무관하게 읽음.
export default async (req) => {
  try {
    if (req.method === "GET" && new URL(req.url).searchParams.get("ping")) {
      return Response.json({ ok: true, fn: "list", ready: true });
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return Response.json(
        { ok: false, error: "SUPABASE_URL 또는 SUPABASE_SERVICE_KEY 환경변수가 없습니다." },
        { status: 500 }
      );
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const q = (url.searchParams.get("q") || "").trim();

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    if (id) {
      const { data, error } = await sb.from("contracts").select("*").eq("id", id).single();
      if (error) throw new Error(error.message);
      return Response.json({ ok: true, rows: [data] });
    }

    let query = sb.from("contracts").select("*").order("id", { ascending: false }).limit(200);
    // 제목/상대방 간단 검색 (선택)
    if (q) query = query.or(`title.ilike.%${q}%,counterparty_name.ilike.%${q}%`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return Response.json({ ok: true, rows: data || [] });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
};
