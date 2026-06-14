// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title srCVR — Senior Coverage Receipt Token
 * @notice ERC-20 with Compound cToken exchange rate model.
 *         1 srCVR starts at 1 USDT, exchange rate increases as premiums accrue.
 */
contract srCVR is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdt;
    address public pool;

    uint256 public exchangeRateMantissa = 1e18; // starts 1:1
    uint256 public totalUnderlying;              // total USDT backing

    // Per-issuer tracking
    mapping(address => uint256) public poolUnderlying; // issuerToken => USDT
    mapping(address => uint256) public poolSupply;     // issuerToken => srCVR

    // ─── Events ──────────────────────────────────────────────────────
    event Minted(address indexed depositor, address indexed issuerToken, uint256 usdt, uint256 srCVRAmount, uint256 rate);
    event Redeemed(address indexed holder, address indexed issuerToken, uint256 srCVRAmount, uint256 usdt, uint256 rate);
    event YieldAccrued(address indexed issuerToken, uint256 amount, uint256 newRate);
    event PoolLiquidated(address indexed issuerToken, uint256 amount);

    modifier onlyPool() {
        require(msg.sender == pool, "srCVR: only pool");
        _;
    }

    constructor(address _pool, address _usdt) ERC20("CoverFi Senior Coverage Receipt", "srCVR") {
        pool = _pool;
        usdt = IERC20(_usdt);
    }

    /**
     * @notice Mint srCVR tokens for a USDT deposit.
     * @return minted Amount of srCVR minted
     */
    function mint(address depositor, uint256 usdtAmount, address issuerToken) external onlyPool nonReentrant returns (uint256 minted) {
        uint256 rate = exchangeRateOf(issuerToken); // PER-ISSUER rate — isolated from other issuers

        minted = (usdtAmount * 1e18) / rate;

        totalUnderlying += usdtAmount;
        poolUnderlying[issuerToken] += usdtAmount;
        poolSupply[issuerToken] += minted;

        _mint(depositor, minted);

        emit Minted(depositor, issuerToken, usdtAmount, minted, rate);
    }

    /**
     * @notice Accrue yield from premium payments. Increases exchange rate.
     */
    function accrueYield(uint256 premiumForSenior, address issuerToken) external onlyPool {
        // Premium raises ONLY this issuer's per-issuer rate (no cross-subsidy to other issuers).
        totalUnderlying += premiumForSenior;
        poolUnderlying[issuerToken] += premiumForSenior;

        // Keep the blended global rate fresh for the back-compat view only.
        if (totalSupply() > 0) {
            exchangeRateMantissa = (totalUnderlying * 1e18) / totalSupply();
        }

        emit YieldAccrued(issuerToken, premiumForSenior, exchangeRateOf(issuerToken));
    }

    /**
     * @notice Redeem srCVR for USDT at current exchange rate.
     * @return usdtOut Amount of USDT returned
     */
    function redeem(address holder, uint256 srCVRAmount, address issuerToken) external onlyPool nonReentrant returns (uint256 usdtOut) {
        uint256 rate = exchangeRateOf(issuerToken); // PER-ISSUER — A's losses/gains never touch B
        usdtOut = (srCVRAmount * rate) / 1e18;

        require(usdtOut <= totalUnderlying, "srCVR: insufficient underlying");
        require(usdtOut <= poolUnderlying[issuerToken], "srCVR: insufficient pool underlying");

        totalUnderlying -= usdtOut;
        poolUnderlying[issuerToken] -= usdtOut;
        poolSupply[issuerToken] -= srCVRAmount;

        _burn(holder, srCVRAmount);
        usdt.safeTransfer(holder, usdtOut);

        // Keep the blended global rate fresh for the back-compat view only.
        if (totalSupply() > 0) {
            exchangeRateMantissa = (totalUnderlying * 1e18) / totalSupply();
        }

        emit Redeemed(holder, issuerToken, srCVRAmount, usdtOut, rate);
    }

    /**
     * @notice Liquidate pool for payout on confirmed default.
     * @return liquidated Amount of USDT liquidated
     */
    function liquidate(address issuerToken) external onlyPool nonReentrant returns (uint256 liquidated) {
        liquidated = poolUnderlying[issuerToken];
        if (liquidated > 0) {
            totalUnderlying -= liquidated;
            poolUnderlying[issuerToken] = 0;
            usdt.safeTransfer(pool, liquidated);

            // Recalculate exchange rate
            if (totalSupply() > 0) {
                exchangeRateMantissa = (totalUnderlying * 1e18) / totalSupply();
            }
        }

        emit PoolLiquidated(issuerToken, liquidated);
    }

    // ─── View Functions ──────────────────────────────────────────────

    /// @notice PER-ISSUER exchange rate (poolUnderlying/poolSupply for that issuer). This is the
    /// rate mint/redeem actually use, so one issuer's default or premium NEVER moves another
    /// issuer's senior LPs. Returns 1e18 before that issuer has any supply.
    function exchangeRateOf(address issuerToken) public view returns (uint256) {
        uint256 supply = poolSupply[issuerToken];
        if (supply == 0) return 1e18;
        return (poolUnderlying[issuerToken] * 1e18) / supply;
    }

    function getRedeemableUSDTOf(uint256 srCVRAmount, address issuerToken) external view returns (uint256) {
        return (srCVRAmount * exchangeRateOf(issuerToken)) / 1e18;
    }

    /// @dev Back-compat BLENDED global view (not used for per-issuer mint/redeem math).
    function getRedeemableUSDT(uint256 srCVRAmount) external view returns (uint256) {
        return (srCVRAmount * exchangeRateMantissa) / 1e18;
    }

    /// @dev Back-compat BLENDED global view. Use exchangeRateOf(issuer) for the real per-issuer rate.
    function getCurrentExchangeRate() external view returns (uint256) {
        return exchangeRateMantissa;
    }
}
