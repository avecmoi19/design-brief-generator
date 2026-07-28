// Vercel Serverless Function — /api/generate
// Vercel AI Gateway 경유로 Claude를 호출합니다.
// 인증: AI_GATEWAY_API_KEY(권장) 또는 Vercel 배포 시 자동 주입되는 VERCEL_OIDC_TOKEN.
// (별도 Anthropic 계정/키 불필요 — Vercel AI Gateway 키로 대체)

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/messages";

const BRAND =
  "여성복 브랜드. 포지셔닝은 고가를 제외한 중간 가격대 컨템포러리(29cm·무신사에서 판매가 좋은 컨템포러리)와 SPA 위주. " +
  "코어 타겟은 30대 여성, 서브 타겟은 20대 중후반과 40대 초중반. " +
  "완성도 있는 디자인과 합리적 가격, 데일리 착용성, 그리고 소재를 중심으로 한 시리즈 개발을 중시함.";

function normalizeModel(m) {
  var model = m || "anthropic/claude-sonnet-5";
  if (model.indexOf("/") === -1) {
    // 원시 Anthropic 모델 ID를 AI Gateway 슬러그로 매핑
    if (/haiku/i.test(model)) model = "anthropic/claude-haiku-4.5";
    else if (/sonnet/i.test(model)) model = "anthropic/claude-sonnet-5";
    else if (/opus/i.test(model)) model = "anthropic/claude-opus-5";
    else model = "anthropic/" + model;
  }
  return model;
}

function buildPrompt(o) {
  var season = o.season, chapter = o.chapter, item = o.item, material = o.material, extra = o.extra;
  var matLine = material
    ? "- 중심 소재: " + material + "  (이번 브리프는 이 소재를 축으로 한 시리즈 개발 관점에서 작성하라)"
    : "- 중심 소재: 미지정";
  return [
    "너는 여성복 브랜드의 시니어 상품기획 디렉터다. 아래 브랜드와 조건에 맞는 시즌 디자인 브리프를 작성하라.",
    "",
    "[브랜드]",
    BRAND,
    "",
    "[조건]",
    "- 시즌: " + season,
    "- 챕터/TPO: " + (chapter || "미지정"),
    "- 아이템: " + item,
    matLine,
    "- 추가 무드/키워드: " + (extra || "없음"),
    "",
    "[요구]",
    "아래 JSON 스키마로만 응답하라. 설명·머리말·코드펜스 없이 순수 JSON 객체 하나만 출력한다. 모든 값은 한국어로, 실무에 바로 쓸 만큼 구체적으로.",
    "- 경쟁/참고 브랜드는 반드시 '고가를 제외한 중간 가격대 컨템포러리와 SPA' 위주로, 29cm·무신사에서 판매가 좋은 실제 국내외 브랜드를 예로 들어라.",
    "- color의 hex는 실제 색을 대표하는 값으로.",
    "",
    '{',
    ' "concept": "이 아이템의 한 줄 시즌 컨셉 (20자 내외, 매력적으로)",',
    ' "direction": ["디자인 방향 4~5개, 각 한 문장"],',
    ' "fabric": ["추천 소재 3~4개. 소재명 — 선택 이유 형식. 중심 소재가 있으면 그 소재의 변형/혼방/가공을 우선"],',
    ' "silhouette": ["실루엣 제안 3~4개, 각 한 문장"],',
    ' "color": [{"name":"컬러명(한글)","hex":"#RRGGBB","note":"용도/비중"}],',
    ' "details": ["차별화 디테일 4~5개, 각 한 문장"],',
    ' "competitors": [{"brand":"중가 컨템포러리/SPA 브랜드","point":"참고 포인트"}],',
    ' "sellingPoints": ["판매포인트 4~5개, 고객 관점 카피톤으로"]',
    '}',
    "",
    "color는 5~6개, competitors는 4~5개 제안하라."
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

    // 상태 점검용 (브라우저에서 /api/generate 로 접속하면 이게 보임)
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
