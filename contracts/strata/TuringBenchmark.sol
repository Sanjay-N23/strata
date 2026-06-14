// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./StrataTypes.sol";

interface IStrataAgentRep {
    function recordOutcome(bool wasCorrect) external;
}

interface IReplaySignals {
    function signalsAt(address issuer, uint64 epoch) external view returns (IssuerSignals memory);
}

interface IStaticScorer {
    function computeStaticScore(IssuerSignals memory s) external view returns (uint16);
}

/**
 * @title TuringBenchmark — on-chain AI-vs-human underwriting record
 * @notice The heart of the Strata "Turing Test": for each issuer it records BOTH
 *         arms per epoch — the AI underwriter's score and the static rulebook
 *         ("human baseline") score — over identical inputs. When ground truth
 *         arrives (resolve), it computes how many epochs BEFORE the event each arm
 *         first crossed the alarm threshold. Earlier warning wins.
 *
 *         This is the permanent, auditable benchmark the hackathon asks for. The AI's
 *         reputation (in StrataAIAgent) is bumped only when it warns at least as early
 *         as the static arm — never by self-assertion.
 */
contract TuringBenchmark is Ownable2Step {
    uint16 public constant ALARM_THRESHOLD = 300; // score < 300 == distress alarm

    struct Record {
        uint64 epoch;
        uint16 aiScore;
        uint16 staticScore;
        uint16 aiPdBps;
    }

    struct Resolution {
        bool defaulted;
        uint64 eventEpoch;
        int256 aiLeadEpochs;     // epochs before event AI first alarmed; -1 = never
        int256 staticLeadEpochs; // epochs before event static first alarmed; -1 = never
        uint8 winner;            // 0 tie/none, 1 AI, 2 static
    }

    address public recorder;     // StrataAIAgent (or keeper) — the only writer
    address public strataAgent;  // for reputation callback
    address public replayOracle; // on-chain signal source (trust-minimised static arm)
    address public irsOracle;    // canonical static-arm scorer (computeStaticScore)

    mapping(address => Record[]) private _records;
    mapping(address => bool) public isResolved;
    mapping(address => Resolution) public resolutions;

    uint256 public aiWins;
    uint256 public staticWins;
    int256 public sumLeadDeltaEpochs; // Σ(aiLead - staticLead) across resolved issuers
    uint256 public resolvedCount;

    event ArmsRecorded(address indexed issuer, uint64 epoch, uint16 aiScore, uint16 staticScore, uint16 aiPdBps);
    event Resolved(address indexed issuer, bool defaulted, int256 aiLeadEpochs, int256 staticLeadEpochs, uint8 winner);
    event RecorderUpdated(address indexed recorder);
    event StrataAgentUpdated(address indexed agent);
    event OraclesUpdated(address replayOracle, address irsOracle);

    modifier onlyRecorder() {
        require(msg.sender == recorder || msg.sender == owner(), "Bench: not recorder");
        _;
    }

    function setRecorder(address _recorder) external onlyOwner {
        recorder = _recorder;
        emit RecorderUpdated(_recorder);
    }

    function setStrataAgent(address _agent) external onlyOwner {
        strataAgent = _agent;
        emit StrataAgentUpdated(_agent);
    }

    /// @notice Wire the on-chain signal source + static scorer used by recordFromReplay.
    function setOracles(address _replayOracle, address _irsOracle) external onlyOwner {
        replayOracle = _replayOracle;
        irsOracle = _irsOracle;
        emit OraclesUpdated(_replayOracle, _irsOracle);
    }

    /**
     * @notice Trust-minimised recorder (PRODUCTION path). Derives the static-arm score
     *         ON-CHAIN via IRSOracle.computeStaticScore over the IssuerSignals already
     *         pushed to ReplayOracle — so the rules-based baseline cannot be hand-fed by
     *         the recorder; both arms read the SAME on-chain signals. Append-only.
     */
    function recordFromReplay(
        address issuer,
        uint64 epoch,
        uint16 aiScore,
        uint16 aiPdBps
    ) external onlyRecorder {
        require(!isResolved[issuer], "Bench: already resolved");
        require(replayOracle != address(0) && irsOracle != address(0), "Bench: oracles unset");
        IssuerSignals memory sig = IReplaySignals(replayOracle).signalsAt(issuer, epoch);
        uint16 staticScore = IStaticScorer(irsOracle).computeStaticScore(sig);
        _records[issuer].push(Record({ epoch: epoch, aiScore: aiScore, staticScore: staticScore, aiPdBps: aiPdBps }));
        emit ArmsRecorded(issuer, epoch, aiScore, staticScore, aiPdBps);
    }

    /**
     * @notice Raw recorder — caller supplies staticScore directly. Retained for unit
     *         tests of the aggregation math; production uses recordFromReplay. Append-only.
     */
    function record(
        address issuer,
        uint64 epoch,
        uint16 aiScore,
        uint16 staticScore,
        uint16 aiPdBps
    ) external onlyRecorder {
        require(!isResolved[issuer], "Bench: already resolved");
        _records[issuer].push(Record({ epoch: epoch, aiScore: aiScore, staticScore: staticScore, aiPdBps: aiPdBps }));
        emit ArmsRecorded(issuer, epoch, aiScore, staticScore, aiPdBps);
    }

    /**
     * @notice Settle an issuer against ground truth. Computes per-arm lead-time and
     *         tallies the winner. On a real default, bumps the AI's reputation iff it
     *         warned at least as early as the static arm (and did warn).
     */
    function resolve(address issuer, bool defaulted, uint64 eventEpoch) external onlyOwner {
        require(!isResolved[issuer], "Bench: already resolved");
        Record[] storage recs = _records[issuer];
        require(recs.length > 0, "Bench: no records");

        int256 aiLead = _leadEpochs(recs, eventEpoch, true);
        int256 staticLead = _leadEpochs(recs, eventEpoch, false);

        uint8 winner = 0;
        if (aiLead > staticLead) winner = 1;
        else if (staticLead > aiLead) winner = 2;

        resolutions[issuer] = Resolution({
            defaulted: defaulted,
            eventEpoch: eventEpoch,
            aiLeadEpochs: aiLead,
            staticLeadEpochs: staticLead,
            winner: winner
        });
        isResolved[issuer] = true;

        resolvedCount++;
        sumLeadDeltaEpochs += (aiLead - staticLead);
        if (winner == 1) aiWins++;
        else if (winner == 2) staticWins++;

        // Reputation: AI is "correct" if it gave a real, timely warning at least as
        // early as the rulebook. Only meaningful when an event actually occurred.
        if (defaulted && strataAgent != address(0)) {
            bool aiCorrect = (aiLead >= 0) && (aiLead >= staticLead);
            IStrataAgentRep(strataAgent).recordOutcome(aiCorrect);
        }

        emit Resolved(issuer, defaulted, aiLead, staticLead, winner);
    }

    /**
     * @dev First epoch (smallest) at which the chosen arm's score < ALARM_THRESHOLD and
     *      epoch <= eventEpoch. Returns (eventEpoch - thatEpoch) as lead, or -1 if the
     *      arm never alarmed before the event.
     */
    function _leadEpochs(Record[] storage recs, uint64 eventEpoch, bool ai) internal view returns (int256) {
        bool found;
        uint64 firstAlarmEpoch;
        for (uint256 i = 0; i < recs.length; i++) {
            Record storage r = recs[i];
            if (r.epoch > eventEpoch) continue;
            uint16 score = ai ? r.aiScore : r.staticScore;
            if (score < ALARM_THRESHOLD) {
                if (!found || r.epoch < firstAlarmEpoch) {
                    found = true;
                    firstAlarmEpoch = r.epoch;
                }
            }
        }
        if (!found) return -1;
        return int256(uint256(eventEpoch)) - int256(uint256(firstAlarmEpoch));
    }

    // ─── Views ───────────────────────────────────────────────────────
    function tally() external view returns (uint256 ai, uint256 stat, int256 avgLeadDeltaEpochs) {
        ai = aiWins;
        stat = staticWins;
        avgLeadDeltaEpochs = resolvedCount == 0 ? int256(0) : sumLeadDeltaEpochs / int256(resolvedCount);
    }

    function recordCount(address issuer) external view returns (uint256) {
        return _records[issuer].length;
    }

    function recordAt(address issuer, uint256 i) external view returns (Record memory) {
        return _records[issuer][i];
    }
}
