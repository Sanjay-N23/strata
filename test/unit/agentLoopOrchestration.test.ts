import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as chainMod from "../../agent/chain";
import { main } from "../../agent/index";

/**
 * ============================================================================
 *  White-box test of the agent's main() ORCHESTRATION with a fully mocked chain.
 *  (Gap-fill #1: decideActions is pure-tested and the on-chain sequence is
 *  integration-tested, but main()'s own loop body — the once-only proposal
 *  guard and the prevScore carry-over across epochs — wasn't pinned in isolation.)
 *
 *  TS compiles `import { getContracts } from "./chain"` to a property access on
 *  the cached chain module object, so replacing `chainMod.getContracts` here is
 *  picked up by index.ts at call time — no network, no wallet, no deployment.
 * ============================================================================
 */
describe("agent/index · main() orchestration (mocked chain)", function () {
  const DEAD = "0x000000000000000000000000000000000000dEaD";
  let origGetContracts: any;
  let origLog: any;
  let savedIssuer: string | undefined;
  let savedKey: string | undefined;
  let calls: Record<string, number>;
  let order: string[];

  const N = (() => {
    const ds = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "..", "agent", "data", "usdc_svb.json"), "utf8")
    );
    return ds.epochs.length as number;
  })();

  function tx(name: string) {
    return { wait: async () => { order.push(name); return {}; } };
  }

  beforeEach(function () {
    savedIssuer = process.env.ISSUER_ADDRESS;
    savedKey = process.env.ZAI_API_KEY;
    process.env.ISSUER_ADDRESS = DEAD;
    delete process.env.ZAI_API_KEY; // deterministic offline memo (no fetch)

    calls = { pushSignals: 0, submitScore: 0, record: 0, earlyWarning: 0, propose: 0, setCursor: 0, staticReads: 0 };
    order = [];

    origLog = console.log;
    console.log = () => {}; // silence the per-epoch loop logging

    origGetContracts = (chainMod as any).getContracts;
    (chainMod as any).getContracts = () => ({
      signer: { getAddress: async () => "0xOperator" },
      provider: {},
      network: "localhost",
      agent: {
        submitScore: () => { calls.submitScore++; return tx("submitScore"); },
        flagEarlyWarning: () => { calls.earlyWarning++; return tx("earlyWarning"); },
        proposeDefault: () => { calls.propose++; return tx("propose"); },
      },
      oracle: { computeStaticScore: async () => { calls.staticReads++; return 900n; } },
      replay: {
        pushSignals: () => { calls.pushSignals++; return tx("pushSignals"); },
        setCursor: () => { calls.setCursor++; return tx("setCursor"); },
      },
      bench: {
        record: () => { calls.record++; return tx("record"); },
        recordFromReplay: () => { calls.record++; return tx("record"); }, // production path (on-chain static arm)
      },
      defaultOracle: {},
    });
  });

  afterEach(function () {
    (chainMod as any).getContracts = origGetContracts;
    console.log = origLog;
    if (savedIssuer === undefined) delete process.env.ISSUER_ADDRESS; else process.env.ISSUER_ADDRESS = savedIssuer;
    if (savedKey === undefined) delete process.env.ZAI_API_KEY; else process.env.ZAI_API_KEY = savedKey;
  });

  it("drives each green action once per epoch and reads the static arm each epoch", async function () {
    await main();
    expect(calls.pushSignals, "pushSignals / epoch").to.equal(N);
    expect(calls.submitScore, "submitScore / epoch").to.equal(N);
    expect(calls.record, "benchmark.record / epoch").to.equal(N);
    expect(calls.setCursor, "setCursor / epoch").to.equal(N);
    expect(calls.staticReads, "static rulebook read / epoch").to.equal(N);
  });

  it("proposes a default EXACTLY ONCE across the whole replay (once-only guard)", async function () {
    // The USDC–SVB dataset has multiple distress epochs; the `proposed` guard
    // must collapse them to a single on-chain proposeDefault.
    await main();
    expect(calls.propose).to.equal(1);
  });

  it("raises at least one early warning (prevScore carry-over works)", async function () {
    // flagEarlyWarning only fires when prevScore - score >= 50, which requires
    // main() to carry prevScore correctly between epochs.
    await main();
    expect(calls.earlyWarning).to.be.greaterThan(0);
  });

  it("perceives before it acts each epoch (pushSignals → submitScore → record)", async function () {
    await main();
    const firstPush = order.indexOf("pushSignals");
    const firstSubmit = order.indexOf("submitScore");
    const firstRecord = order.indexOf("record");
    expect(firstPush).to.be.greaterThanOrEqual(0);
    expect(firstPush).to.be.lessThan(firstSubmit);
    expect(firstSubmit).to.be.lessThan(firstRecord);
  });

  it("is idempotent across runs (deterministic call counts)", async function () {
    await main();
    const first = { ...calls };
    calls = { pushSignals: 0, submitScore: 0, record: 0, earlyWarning: 0, propose: 0, setCursor: 0, staticReads: 0 };
    order = [];
    await main();
    expect(calls).to.deep.equal(first);
  });
});
