// 합성 preview 전용 위치 종료 endpoint. 운영 위치 서버·DB를 호출하지 않는다.
export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, code: "METHOD_NOT_SUPPORTED" });
  const token = String(req.body?.token || "");
  if (!/^review-location-\d+-\d+$/.test(token)) return res.status(401).json({ success: false, code: "UNAUTHORIZED" });
  return res.status(200).json({ success: true, synthetic: true });
}
