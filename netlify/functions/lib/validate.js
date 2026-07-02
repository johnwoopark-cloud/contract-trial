// 공용 검증 로직 (extract.js / save.js 가 공유)

function isValidDate(s) {
  if (s === null || s === undefined || s === "") return true; // 없어도 됨(null 허용)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
}

function isValidBizNo(raw) {
  if (!raw) return true; // 없으면 통과(선택 필드)
  const n = String(raw).replace(/[^0-9]/g, "");
  if (n.length !== 10) return false;
  const key = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(n[i]) * key[i];
  sum += Math.floor((Number(n[8]) * 5) / 10);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(n[9]);
}

export function validate(f) {
  const errors = [];
  const warnings = [];

  if (!f.title) errors.push("계약 제목이 비어 있습니다.");
  if (!f.counterparty_name) errors.push("계약 상대방이 비어 있습니다.");

  if (!isValidDate(f.start_date)) errors.push("계약 개시일 형식 오류(YYYY-MM-DD).");
  if (!isValidDate(f.end_date))   errors.push("계약 종료일 형식 오류(YYYY-MM-DD).");

  if (f.start_date && f.end_date && isValidDate(f.start_date) && isValidDate(f.end_date)) {
    if (new Date(f.end_date) <= new Date(f.start_date))
      errors.push("계약 종료일이 개시일보다 빠르거나 같습니다.");
  }

  if (!isValidBizNo(f.counterparty_biz_no))
    errors.push("사업자등록번호 형식/체크섬 오류.");

  if (!f.start_date) warnings.push("계약 개시일이 없습니다(규정상 '날인일'로 대체 검토).");
  if (!f.end_date)   warnings.push("계약 종료일이 없습니다('계약서 참조' 여부 확인).");
  if (f.auto_renewal === true && !f.renewal_notice)
    warnings.push("자동갱신인데 갱신 통보 일자가 비어 있습니다.");

  return { errors, warnings, ok: errors.length === 0 };
}
