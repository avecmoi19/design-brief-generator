// Vercel Serverless Function — /api/generate
// Vercel AI Gateway 경유로 Claude를 호출합니다.
// 인증: AI_GATEWAY_API_KEY(권장) 또는 Vercel 배포 시 자동 주입되는 VERCEL_OIDC_TOKEN.

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/messages";

const BRAND =
  "여성복 브랜드. 포지셔닝은 고가를 제외한 중간 가격대 컨템포러리(29cm·무신사에서 판매가 좋은 컨템포러리)와 SPA 위주. " +
  "코어 타겟은 30대 여성, 서브 타겟은 20대 중후반과 40대 초중반. " +
  "완성도 있는 디자인과 합리적 가격, 데일리 착용성, 그리고 소재를 중심으로 한 시리즈 개발을 중시함.";

function normalizeModel(m) {
  var model = m || "anthropic/claude-sonnet-5";
  if (model.indexOf("/") === -1) {
    if (/haiku/i.test(model)) model = "anthropic/claude-haiku-4.5";
    else if (/sonnet/i.test(model)) model = "anthropic/claude-sonnet-5";
    else if (/opus/i.test(model)) model = "anthropic/claude-opus-5";
    else model = "anthropic/" + model;
  }
  return model;
}

function buildPrompt(o) {
  var matLine = o.material
    ? "- 중심 소재: " + o.material + "  (이 소재를 축으로 한 시리즈 개발 관점 반영)"
    : "- 중심 소재: 미지정";
  return [
    "너는 여성복 브랜드의 시니어 상품기획 디렉터다. 아래 아이템에 대해 '대표님 스타일 컨펌'에 쓸 컨펌시트를 작성하라.",
    "핵심 목표: 히어로 상품을 사후에 발견하지 않고, 기획 단계에서 사전에 설계한다.",
    "",
    "[브랜드]",
    BRAND,
    "",
    "[아이템 조건]",
    "- 시즌: " + o.season,
    "- 챕터/TPO: " + (o.chapter || "미지정"),
    "- 아이템: " + o.item,
    matLine,
    "- 원가: " + (o.cost || "미지정"),
    "- 판매가: " + (o.price || "미지정"),
    "- 타깃/니즈: " + (o.target || "미지정"),
    "- 추가 무드/키워드: " + (o.extra || "없음"),
    "",
    "[작성 규칙]",
    "아래 JSON 스키마로만 응답하라. 설명·머리말·코드펜스 없이 순수 JSON 객체 하나만 출력한다. 모든 값은 한국어.",
    "- assessment의 5개 항목은 각 검증 질문에 답하는 '소구점(point, 1~2문장)'과 '판정(verdict)'을 준다.",
    "- verdict는 반드시 다음 중 하나: \"충족\", \"조건부\", \"보완 필요\".",
    "- 이건 컨펌 전 자가진단이다. 과장하지 말 것. 원가는 원가·판매가가 모두 주어지면 마진율 관점으로 평가하고, 둘 중 하나라도 미지정이면 솔직히 \"보완 필요\" 또는 \"조건부\"로 표시하고 point에 무엇을 확인해야 하는지 적어라. 다른 항목도 정보가 부족하면 동일하게 처리하라.",
    "- series는 이 아이템과 함께 시리즈(군집)를 이룰 확장 아이템만 제안한다. 실존하지 않는 브랜드명은 절대 쓰지 말고 '아이템 종류'로만.",
    "- color의 hex는 실제 색을 대표하는 값으로.",
    "",
    "{",
    ' "concept": "이 아이템의 한 줄 컨셉 (20자 내외, 매력적으로)",',
    ' "assessment": {',
    '   "고객": {"point":"명확한 타깃 니즈가 있는가에 대한 소구점","verdict":"충족|조건부|보완 필요"},',
    '   "상품성": {"point":"구매 이유가 한 문장으로 설명되는가에 대한 소구점","verdict":"충족|조건부|보완 필요"},',
    '   "차별성": {"point":"기존 베스트·경쟁 상품과 차별화되는가에 대한 소구점","verdict":"충족|조건부|보완 필요"},',
    '   "IMC": {"point":"대량 판매를 기대할 수 있는 근거에 대한 소구점","verdict":"충족|조건부|보완 필요"},',
    '   "원가": {"point":"목표 판매가 대비 원가 구조가 적정한가에 대한 소구점","verdict":"충족|조건부|보완 필요"}',
    " },",
    ' "fabric": ["핵심 소재 2~3개. 소재명 — 한 줄 이유 형식"],',
    ' "silhouette": ["핵심 실루엣 포인트 2~3개"],',
    ' "color": [{"name":"컬러명(한글)","hex":"#RRGGBB","note":"용도/비중"}],',
    ' "details": ["핵심 디테일 2~3개"],',
    ' "series": ["함께 시리즈를 이룰 확장 아이템 2~3개. 아이템명 — 한 줄 이유 형식"]',
    "}",
    "",
    "color는 4~5개 제안하라."
  ].join("\n");
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise(function (resolve) {
    var data = "";
    req.on("data", function (c) { data += c; });
    req.on("end", function () { resolve(data); });
    req.on("error", function () { resolve(""); });
  });
}

module.exports = async function (req, res) {
  try {
    var gatewayKey = process.env.AI_GATEWAY_API_KEY || "";
    var oidc = process.env.VERCEL_OIDC_TOKEN || "";
    var model = normalizeModel(process.env.CLAUDE_MODEL);

    if (req.method === "GET") {
      return send(res, 200, {
        ok: true,
        provider: "vercel-ai-gateway",
        hasGatewayKey: !!gatewayKey,
        hasOidc: !!oidc,
        model: model
      });
    }
    if (req.method !== "POST") return send(res, 405, { error: "POST only" });

    if (!gatewayKey && !oidc) {
      return send(res, 500, { error: "인증 정보가 없어요. Vercel 환경변수 AI_GATEWAY_API_KEY를 설정하세요." });
    }
    if (typeof fetch !== "function") return send(res, 500, { error: "Node 18 이상 런타임이 필요해요." });

    var body = req.body;
    if (!body || typeof body === "string") {
      var raw = (typeof body === "string" && body) ? body : await readBody(req);
      try { body = raw ? JSON.parse(raw) : {}; } catch (_) { body = {}; }
    }
    if (!body.season || !body.item) return send(res, 400, { error: "시즌과 아이템은 필수예요." });

    var headers = { "content-type": "application/json", "anthropic-version": "2023-06-01" };
    if (gatewayKey) headers["x-api-key"] = gatewayKey;
    else headers["authorization"] = "Bearer " + oidc;

    var r = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: model,
        max_tokens: 4000,
        messages: [{ role: "user", content: buildPrompt(body) }]
      })
    });

    var txt = await r.text();
    if (!r.ok) return send(res, 502, { error: "생성 실패 [" + r.status + "] " + txt.slice(0, 400) });

    var data;
    try { data = JSON.parse(txt); } catch (_) { return send(res, 502, { error: "AI 응답 형식 오류" }); }
    var text = (data && data.content && data.content[0] && data.content[0].text) || "";
    return send(res, 200, { text: text });
  } catch (e) {
    try { send(res, 500, { error: String((e && e.message) || e) }); } catch (_) {}
  }
};
