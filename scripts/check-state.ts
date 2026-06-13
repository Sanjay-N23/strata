import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const deployFile = path.join(__dirname, "..", "deployments", "hashkeyTestnet.json");
  const deployment = JSON.parse(fs.readFileSync(deployFile, "utf-8"));
  const c = deployment.contracts;

  const mockUSDT       = await ethers.getContractAt("MockUSDT", c.MockUSDT);
  const issuerRegistry = await ethers.getContractAt("IssuerRegistry", c.IssuerRegistry);
  const irsOracle      = await ethers.getContractAt("IRSOracle", c.IRSOracle);
  const insurancePool  = await ethers.getContractAt("InsurancePool", c.InsurancePool);
  const srCVR          = await ethers.getContractAt("srCVR", c.srCVR);
  const jrCVR          = await ethers.getContractAt("jrCVR", c.jrCVR);
  const payoutEngine   = await ethers.getContractAt("PayoutEngine", c.PayoutEngine);
  const protectionCert = await ethers.getContractAt("ProtectionCert", c.ProtectionCert);
  const subrogationNFT = await ethers.getContractAt("SubrogationNFT", c.SubrogationNFT);
  const issuerBond     = await ethers.getContractAt("IssuerBond", c.IssuerBond);

  const tokenAddress = c.MockERC3643Token;

  console.log("══════════════════════════════════════════");
  console.log("  STRATA — CURRENT ON-CHAIN STATE");
  console.log(`  Deployer: ${deployer.address}`);
  console.log("══════════════════════════════════════════\n");

  // USDT balance
  const usdtBal = await mockUSDT.balanceOf(deployer.address);
  console.log(`USDT Balance:        ${ethers.formatEther(usdtBal)} USDT`);

  // Issuer status
  // 0=NONE, 1=OBSERVATION, 2=ACTIVE, 3=MONITORING, 4=DEFAULTED, 5=WIND_DOWN, 6=CLOSED
  const statusNames = ["OBSERVATION","ACTIVE","MONITORING","DEFAULTED","WIND_DOWN","CLOSED"];
  try {
    const status = await issuerRegistry.getStatus(tokenAddress);
    console.log(`Issuer Status:       ${statusNames[Number(status)]} (${status})`);
  } catch(e) { console.log(`Issuer Status:       ERROR - ${(e as any).message?.slice(0,60)}`); }

  // IRS Score
  try {
    const score = await irsOracle.getScore(tokenAddress);
    const premium = await irsOracle.getPremiumRateBPS(tokenAddress);
    console.log(`IRS Score:           ${score}`);
    console.log(`Premium Rate:        ${premium} bps (${Number(premium)/100}% APR)`);
  } catch(e) { console.log(`IRS Score:           ERROR - ${(e as any).message?.slice(0,60)}`); }

  // Pool state
  try {
    const pool = await insurancePool.getPoolState(tokenAddress);
    console.log(`\nPool Senior TVL:     ${ethers.formatEther(pool.seniorTVL)} USDT`);
    console.log(`Pool Junior TVL:     ${ethers.formatEther(pool.juniorTVL)} USDT`);
    console.log(`Pool isActive:       ${pool.isActive}`);
  } catch(e) { console.log(`Pool State:          ERROR - ${(e as any).message?.slice(0,60)}`); }

  // srCVR / jrCVR balances
  try {
    const srBal = await srCVR.balanceOf(deployer.address);
    const jrBal = await jrCVR.balanceOf(deployer.address, tokenAddress);
    const exRate = await srCVR.getCurrentExchangeRate();
    console.log(`\nsrCVR Balance:       ${ethers.formatEther(srBal)}`);
    console.log(`jrCVR Balance:       ${ethers.formatEther(jrBal)}`);
    console.log(`Senior Exchange Rate:${ethers.formatEther(exRate)}`);
  } catch(e) { console.log(`Tranche Balances:    ERROR - ${(e as any).message?.slice(0,60)}`); }

  // Protection certs
  try {
    const certBal = await protectionCert.balanceOf(deployer.address);
    console.log(`\nProtectionCert NFTs: ${certBal}`);
    if (certBal > 0n) {
      for (let i = 0n; i < certBal; i++) {
        const tokenId = await protectionCert.tokenOfOwnerByIndex(deployer.address, i);
        const data = await protectionCert.getCertData(tokenId);
        console.log(`  NFT #${tokenId}: covered=${ethers.formatEther(data.coveredAmount)} USDT`);
      }
    }
  } catch(e) { console.log(`ProtectionCerts:     ERROR - ${(e as any).message?.slice(0,60)}`); }

  // Issuer bond
  try {
    const bond = await issuerBond.getBond(tokenAddress);
    console.log(`\nIssuer Bond:         ${ethers.formatEther(bond.bondAmount)} USDT`);
    console.log(`Bond Liquidated:     ${bond.isLiquidated}`);
  } catch(e) { console.log(`Issuer Bond:         ERROR - ${(e as any).message?.slice(0,60)}`); }

  // SubrogationNFT
  try {
    const claimId = await subrogationNFT.getClaimByIssuer(tokenAddress);
    if (claimId > 0n) {
      const claim = await subrogationNFT.getClaimData(claimId);
      console.log(`\nSubrogationNFT:      #${claimId}`);
      console.log(`Total Payout:        ${ethers.formatEther(claim.totalPayoutAmount)} USDT`);
      console.log(`Holder Count:        ${claim.holderCount}`);
    } else {
      console.log(`\nSubrogationNFT:      None minted yet`);
    }
  } catch(e) { console.log(`SubrogationNFT:      ERROR - ${(e as any).message?.slice(0,60)}`); }

  console.log("\n══════════════════════════════════════════");
}

main().catch(console.error);
