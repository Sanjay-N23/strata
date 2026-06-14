// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title MockTIREligibility — minimal isFastTrackEligible stub for IssuerRegistry gate tests.
contract MockTIREligibility {
    bool public eligible;

    function setEligible(bool e) external {
        eligible = e;
    }

    function isFastTrackEligible(address) external view returns (bool) {
        return eligible;
    }
}
