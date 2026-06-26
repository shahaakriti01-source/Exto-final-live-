// ─── INCENTIVE CALCULATION ENGINE ───────────────────────────────────────────
import { getQualifyingTransactions } from "./transactionLogic";
import { getConsumersForMerchant } from "./onboardingLogic";

/**
 * Computes the full incentive breakdown for one merchant, given a phase's config.
 * `onboardingEvents` and `payments` should already be filtered to the desired date range
 * (the date-range filtering happens upstream — this function just calculates).
 */
export function calculateMerchantIncentive(merchantName, onboardingEvents, payments, config) {
  // 1. Consumer onboarding incentive
  const consumers = getConsumersForMerchant(merchantName, onboardingEvents);
  const consumerCount = consumers.length;
  const cappedConsumers = Math.min(consumerCount, config.consumerCap);
  const onboardingIncentive = cappedConsumers * config.consumerRate;

  // 2. Qualifying transactions (pairing/reconciliation already applied)
  const qualifying = getQualifyingTransactions(merchantName, payments);
  const netCount = qualifying.length;
  const cappedCount = Math.min(netCount, config.txnCap);

  // 3. Merchant activation bonus
  const activationEligible = netCount >= config.activationThreshold;

  // 4. Fixed transaction-processing incentive — applies to ALL qualifying transactions
  const fixedIncentive = cappedCount * config.fixedRate;

  // 5. Variable transaction-processing incentive — applies to the SAME full set of
  //    qualifying transactions as the fixed incentive (every qualifying txn where the
  //    merchant is sender OR receiver), capped per-transaction, up to the overall txn cap.
  const variableIncentive = qualifying.slice(0, config.txnCap).reduce((sum, p) => {
    return sum + Math.min(p.amount * (config.variableRate / 100), config.variableCap);
  }, 0);

  // 6. Milestone / activation-tier incentives
  let milestoneIncentive = 0;
  const milestonesHit = [];
  config.milestones.forEach(ms => {
    if (netCount >= ms.count) {
      milestoneIncentive += ms.bonus;
      milestonesHit.push(ms);
    }
  });

  const totalIncentive =
    onboardingIncentive +
    (activationEligible ? config.activationBonus : 0) +
    fixedIncentive +
    variableIncentive +
    milestoneIncentive;

  return {
    merchantName,
    consumers,
    consumerCount,
    cappedConsumers,
    consumerCapHit: consumerCount >= config.consumerCap,
    onboardingIncentive,
    qualifyingTransactions: qualifying,
    netCount,
    cappedCount,
    activationEligible,
    fixedIncentive,
    variableIncentive: Math.round(variableIncentive * 100) / 100,
    milestoneIncentive,
    milestonesHit,
    totalIncentive: Math.round(totalIncentive * 100) / 100,
  };
}

export function calculateAllMerchantIncentives(merchantNames, onboardingEvents, payments, config) {
  return merchantNames.map(name => calculateMerchantIncentive(name, onboardingEvents, payments, config));
}

/** BWP 40 activation total — counted per unique onboarded merchant, regardless of activity. */
export function calculateTotalActivationIncentive(merchantNames, onboardingEvents, activationAmount = 40) {
  const onboardedCount = merchantNames.filter(name =>
    onboardingEvents.some(e => e.isMerchantOnboarding && e.user_name === name)
  ).length;
  return onboardedCount * activationAmount;
}

/**
 * Computes the incentive breakdown for one CONSUMER, given a phase's config.
 * Consumers don't onboard anyone else, so there's no "onboarding incentive"
 * component here — only their own qualifying-transaction activity (fixed,
 * variable, activation, milestones). Every config value defaults to 0 since
 * consumer incentives aren't currently paid out; the moment real numbers are
 * entered, this calculates exactly the same way the merchant engine does.
 */
export function calculateConsumerIncentive(consumerName, payments, config) {
  const qualifying = getQualifyingTransactions(consumerName, payments);
  const netCount = qualifying.length;
  const cappedCount = Math.min(netCount, config.txnCap);

  const activationEligible = config.activationThreshold > 0 && netCount >= config.activationThreshold;
  const fixedIncentive = cappedCount * config.fixedRate;
  const variableIncentive = qualifying.slice(0, config.txnCap).reduce((sum, p) => {
    return sum + Math.min(p.amount * (config.variableRate / 100), config.variableCap);
  }, 0);

  let milestoneIncentive = 0;
  const milestonesHit = [];
  config.milestones.forEach(ms => {
    if (netCount >= ms.count) {
      milestoneIncentive += ms.bonus;
      milestonesHit.push(ms);
    }
  });

  const totalIncentive =
    (activationEligible ? config.activationBonus : 0) +
    fixedIncentive +
    variableIncentive +
    milestoneIncentive;

  return {
    consumerName,
    qualifyingTransactions: qualifying,
    netCount,
    cappedCount,
    activationEligible,
    fixedIncentive,
    variableIncentive: Math.round(variableIncentive * 100) / 100,
    milestoneIncentive,
    milestonesHit,
    totalIncentive: Math.round(totalIncentive * 100) / 100,
  };
}
