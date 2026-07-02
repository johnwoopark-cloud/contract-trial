import { createClient } from "@supabase/supabase-js";
import { validate } from "./lib/validate.js";

export default async (req) => {
  try {
    const { record, path, humanConfirmed } = await req.json();

    const v = validate(record);
    if (!v.ok)
      return Response.json({ ok: false, reason: "errors", errors: v.errors }, { status: 400 });
    if (v.warnings.length && !humanConfirmed)
      return Response.json({ ok: false, reason: "needs_confirm", warnings: v.warnings });

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const { data, error } = await sb.from("contracts")
      .insert({ ...record, source_file_path: path, status: "confirmed" })
      .select("id").single();
    if (error) throw new Error(error.message);

    return Response.json({ ok: true, id: data.id });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
};
