import { expect } from "chai";
import { creditMemo } from "../../agent/zai";
import type { PdResult, Signals } from "../../agent/pdModel";

/**
 * ============================================================================
 *  agent/zai.ts — GLM-4.6 client + offline fallback (EXHAUSTIVE)
 * ============================================================================
 *  creditMemo() either calls the Z.AI chat endpoint or falls back to the
 *  deterministic pdModel rationale. We mock global.fetch + process.env to cover
 *  every path with Equivalence Partitioning (response classes) and BVA (HTTP
 *  status codes), plus request-construction and determinism checks.
 *
 *  Paths (EP):
 *    no key            → rationale (no network)
 *    200 + content     → trimmed content
 *    non-200           → rationale
 *    200 malformed     → rationale (or "" for whitespace content)
 *    fetch/json throws → rationale
 * ============================================================================
 */

const SIGNALS: Signals = {
  navPunctuality: 935, attestationConsistency: 910, repaymentReliability: 945,
  collateralRatioBps: 9900, activityScore: 700, offChainSentiment: 330, epoch: 3,
};
const PD: PdResult = { score: 250, pdBps: 7500, rationale: "DETERMINISTIC_FALLBACK", driver: "distress override" };

describe("agent/zai · creditMemo", function () {
  let origFetch: any;
  const saved: Record<string, string | undefined> = {};
  let lastUrl = "";
  let lastInit: any = null;
  let fetchCalls = 0;

  beforeEach(function () {
    origFetch = (global as any).fetch;
    for (const k of ["ZAI_API_KEY", "ZAI_MODEL", "ZAI_BASE_URL"]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    lastUrl = ""; lastInit = null; fetchCalls = 0;
  });
  afterEach(function () {
    (global as any).fetch = origFetch;
    for (const k of ["ZAI_API_KEY", "ZAI_MODEL", "ZAI_BASE_URL"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  const setFetch = (impl: (url: string, init: any) => any) => {
    (global as any).fetch = async (url: string, init: any) => {
      fetchCalls++; lastUrl = url; lastInit = init; return impl(url, init);
    };
  };
  const ok = (obj: any) => ({ ok: true, status: 200, json: async () => obj });
  const reply = (content: string) => ok({ choices: [{ message: { content } }] });

  // ── M0: offline fallback (no key) ─────────────────────────────────────
  describe("M0 · offline fallback", function () {
    it("no key → rationale, never fetches", async function () {
      setFetch(() => reply("X"));
      expect(await creditMemo(SIGNALS, PD)).to.equal(PD.rationale);
      expect(fetchCalls).to.equal(0);
    });
    it("empty-string key → fallback (falsy)", async function () {
      process.env.ZAI_API_KEY = "";
      setFetch(() => reply("X"));
      expect(await creditMemo(SIGNALS, PD)).to.equal(PD.rationale);
      expect(fetchCalls).to.equal(0);
    });
  });

  // ── M1: request construction ──────────────────────────────────────────
  describe("M1 · request construction", function () {
    beforeEach(() => { process.env.ZAI_API_KEY = "sk-test"; });
    it("hits chat/completions with auth + deterministic params + 2 messages", async function () {
      setFetch(() => reply("memo"));
      await creditMemo(SIGNALS, PD);
      expect(lastUrl).to.equal("https://api.z.ai/api/paas/v4/chat/completions");
      expect(lastInit.method).to.equal("POST");
      expect(lastInit.headers.Authorization).to.equal("Bearer sk-test");
      expect(lastInit.headers["Content-Type"]).to.equal("application/json");
      const body = JSON.parse(lastInit.body);
      expect(body.model).to.equal("glm-4.6");
      expect(body.temperature).to.equal(0);
      expect(body.top_p).to.equal(1);
      expect(body.seed).to.equal(42);
      expect(body.messages).to.have.lengthOf(2);
      expect(body.messages[0].role).to.equal("system");
      expect(body.messages[1].role).to.equal("user");
      const user = JSON.parse(body.messages[1].content);
      expect(user.modelScore).to.equal(250);
      expect(user.pdBps).to.equal(7500);
      expect(user.driver).to.equal("distress override");
    });
    it("honors ZAI_MODEL + ZAI_BASE_URL overrides (call-time config)", async function () {
      process.env.ZAI_MODEL = "glm-4.6-air";
      process.env.ZAI_BASE_URL = "https://proxy.test/v1";
      setFetch(() => reply("x"));
      await creditMemo(SIGNALS, PD);
      expect(lastUrl).to.equal("https://proxy.test/v1/chat/completions");
      expect(JSON.parse(lastInit.body).model).to.equal("glm-4.6-air");
    });
  });

  // ── M2: success path ──────────────────────────────────────────────────
  describe("M2 · success", function () {
    beforeEach(() => { process.env.ZAI_API_KEY = "k"; });
    it("returns the model content", async function () {
      setFetch(() => reply("Issuer distressed; collateral and sentiment collapsing."));
      expect(await creditMemo(SIGNALS, PD)).to.equal("Issuer distressed; collateral and sentiment collapsing.");
    });
    it("trims surrounding whitespace", async function () {
      setFetch(() => reply("   trimmed memo   "));
      expect(await creditMemo(SIGNALS, PD)).to.equal("trimmed memo");
    });
  });

  // ── M3: HTTP error → fallback (BVA over status) ───────────────────────
  describe("M3 · HTTP error → fallback", function () {
    beforeEach(() => { process.env.ZAI_API_KEY = "k"; });
    [400, 401, 403, 429, 500, 503].forEach(status =>
      it(`status ${status} → rationale`, async function () {
        setFetch(() => ({ ok: false, status, json: async () => ({}) }));
        expect(await creditMemo(SIGNALS, PD)).to.equal(PD.rationale);
      })
    );
  });

  // ── M4: malformed / empty response (EP) ───────────────────────────────
  describe("M4 · malformed response → fallback", function () {
    beforeEach(() => { process.env.ZAI_API_KEY = "k"; });
    it("no choices → fallback", async function () {
      setFetch(() => ok({}));
      expect(await creditMemo(SIGNALS, PD)).to.equal(PD.rationale);
    });
    it("empty choices array → fallback", async function () {
      setFetch(() => ok({ choices: [] }));
      expect(await creditMemo(SIGNALS, PD)).to.equal(PD.rationale);
    });
    it("choice missing message/content → fallback", async function () {
      setFetch(() => ok({ choices: [{}] }));
      expect(await creditMemo(SIGNALS, PD)).to.equal(PD.rationale);
    });
    it("empty-string content → fallback (falsy)", async function () {
      setFetch(() => reply(""));
      expect(await creditMemo(SIGNALS, PD)).to.equal(PD.rationale);
    });
    it("whitespace-only content → trimmed to '' (documented edge)", async function () {
      setFetch(() => reply("   "));
      expect(await creditMemo(SIGNALS, PD)).to.equal("");
    });
  });

  // ── M5: exceptions → fallback ─────────────────────────────────────────
  describe("M5 · exceptions → fallback", function () {
    beforeEach(() => { process.env.ZAI_API_KEY = "k"; });
    it("fetch throws (network) → rationale", async function () {
      setFetch(() => { throw new Error("ECONNREFUSED"); });
      expect(await creditMemo(SIGNALS, PD)).to.equal(PD.rationale);
    });
    it("res.json throws (bad body) → rationale", async function () {
      setFetch(() => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }));
      expect(await creditMemo(SIGNALS, PD)).to.equal(PD.rationale);
    });
  });

  // ── M6: determinism ───────────────────────────────────────────────────
  describe("M6 · determinism", function () {
    beforeEach(() => { process.env.ZAI_API_KEY = "k"; });
    it("identical inputs → identical request body (temp 0 / seed 42 pinned)", async function () {
      setFetch(() => reply("m"));
      await creditMemo(SIGNALS, PD);
      const b1 = lastInit.body;
      await creditMemo(SIGNALS, PD);
      const b2 = lastInit.body;
      expect(b1).to.equal(b2);
      const p = JSON.parse(b1);
      expect(p.temperature).to.equal(0);
      expect(p.seed).to.equal(42);
    });
  });
});
