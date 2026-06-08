// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./StrataTypes.sol";

/**
 * @title ReplayOracle — deterministic issuer-signal feed for the Turing benchmark
 * @notice Streams timestamped IssuerSignals (e.g. the real USDC–SVB depeg timeline)
 *         into the protocol. BOTH benchmark arms read the SAME signals from here:
 *           - static arm: IRSOracle.computeStaticScore(signalsAt(...))
 *           - AI arm: the off-chain agent reads the same row, reasons, submits a score.
 *
 *         Demo/testnet only. `sourceHash` ties each row to the public dataset row so
 *         the benchmark is auditable and reproducible (rebuts "you scripted it").
 */
contract ReplayOracle is Ownable2Step {
    address public replayKeeper;

    // issuer => epoch => signals
    mapping(address => mapping(uint64 => IssuerSignals)) private _signals;
    mapping(address => uint64) public latestEpoch;
    mapping(address => uint64) public cursor; // current epoch shown in the console

    event SignalsPushed(address indexed issuer, uint64 epoch, bytes32 sourceHash);
    event CursorMoved(address indexed issuer, uint64 epoch);
    event ReplayKeeperUpdated(address indexed keeper);

    modifier onlyKeeper() {
        require(msg.sender == replayKeeper || msg.sender == owner(), "Replay: not keeper");
        _;
    }

    function setReplayKeeper(address _keeper) external onlyOwner {
        replayKeeper = _keeper;
        emit ReplayKeeperUpdated(_keeper);
    }

    function pushSignals(address issuer, IssuerSignals calldata s) external onlyKeeper {
        _signals[issuer][s.epoch] = s;
        if (s.epoch >= latestEpoch[issuer]) latestEpoch[issuer] = s.epoch;
        emit SignalsPushed(issuer, s.epoch, s.sourceHash);
    }

    function signalsAt(address issuer, uint64 epoch) external view returns (IssuerSignals memory) {
        return _signals[issuer][epoch];
    }

    function setCursor(address issuer, uint64 epoch) external onlyKeeper {
        cursor[issuer] = epoch;
        emit CursorMoved(issuer, epoch);
    }
}
