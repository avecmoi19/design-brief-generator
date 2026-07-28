// Vercel Serverless Function — /api/generate
// 브랜드 컨텍스트 + 사용자 입력으로 디자인 브리프를 생성해 JSON 텍스트를 반환.
// API 키는 서버 환경변수(ANTHROPIC_API_KEY)에만 존재하며 브라우저에 노출되지 않습니다.

const BRAND =
  "여성복 브랜드. 포지셔닝은 고가를 제외한 중간 가격대 컨템포러리(29cm·무신사에서 판매가 좋은 컨템포러리)와 SPA 위주. " +
  "코어 타겟은 30대 여성, 서브 타겟은 20대 중후반과 40대 초중반. " +
  "완성도 있는 디자인과 합리적 가격, 데일리 착용성, 그리고 소재를 중심으로 한 시리즈 개발을 중시함.";

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
    // 상태 점검용 (브라우저에서 /api/generate 로 접속하면 이게 보임)
    if (req.method === "GET") {
      return send(res, 200, {
        ok: true,
        hasKey: !!process.env.ANTHROPIC_API_KEY,
        model: process.env.CLAUDE_MODEL || "claude-sonnet-5"
      });
    }
    if (req.method !== "POST") return send(res, 405, { error: "POST only" });

    var key = process.env.ANTHROPIC_API_KEY;
    if (!key) return send(res, 500, { error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았어요. Vercel 환경변수를 확인하세요." });
    if (typeof fetch !== "function") return send(res, 500, { error: "Node 18 이상 런타임이 필요해요." });

    var body = req.body;
    if (!body || typeof body === "string") {
      var raw = (typeof body === "string" && body) ? body : await readBody(req);
      try { body = raw ? JSON.parse(raw) : {}; } catch (_) { body = {}; }
    }
    var season = body.season, item = body.item;
    if (!season || !item) return send(res, 400, { error: "시즌과 아이템은 필수예요." });

    var model = process.env.CLAUDE_MODEL || "claude-sonnet-5";
    var r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 2000,
        messages: [{ role: "user", content: buildPrompt(body) }]
      })
    });

    var txt = await r.text();
    if (!r.ok) return send(res, 502, { error: "생성 요청이 실패했어요.", detail: txt.slice(0, 600) });

    var data;
    try { data = JSON.parse(txt); } catch (_) { return send(res, 502, { error: "AI 응답 형식 오류" }); }
    var text = (data && data.content && data.content[0] && data.content[0].text) || "";
    return send(res, 200, { text: text });
  } catch (e) {
    try { send(res, 500, { error: String((e && e.message) || e) }); } catch (_) {}
  }
};
