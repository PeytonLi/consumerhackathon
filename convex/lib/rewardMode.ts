export type RewardMode = "points_only" | "cash_only" | "hybrid";

export interface RewardModeSummary {
  mode: RewardMode;
  badgeText: string;
  potDisplay: string;
  wagerUnitLabel: string;
  showWhopCheckout: boolean;
  showNickelPoints: boolean;
  seasonPrizeHeadline: string;
}

export function describeRewardMode(params: {
  rewardMode: RewardMode;
  potBalanceCents: number;
  buyInCents: number;
  customRewardLabel?: string;
  nickelBalance?: number;
}): RewardModeSummary {
  const dollars = (params.potBalanceCents / 100).toFixed(2);
  const buyInDollars = (params.buyInCents / 100).toFixed(2);
  const nickels = params.nickelBalance ?? 0;

  if (params.rewardMode === "points_only") {
    return {
      mode: "points_only",
      badgeText: "POINTS & DARES MODE",
      potDisplay: `${nickels} NICKELS`,
      wagerUnitLabel: "NICKELS (PTS)",
      showWhopCheckout: false,
      showNickelPoints: true,
      seasonPrizeHeadline:
        params.customRewardLabel || "Loser funds group dinner + Season Crown",
    };
  }

  if (params.rewardMode === "cash_only") {
    return {
      mode: "cash_only",
      badgeText: `WHOP CASH POT ($${buyInDollars} BUY-IN)`,
      potDisplay: `$${dollars} USD POT`,
      wagerUnitLabel: "USD POT SHARE",
      showWhopCheckout: true,
      showNickelPoints: false,
      seasonPrizeHeadline: `$${dollars} Whop Instant Payout (70% 1st / 30% 2nd)`,
    };
  }

  return {
    mode: "hybrid",
    badgeText: `HYBRID · $${dollars} POT + NICKELS`,
    potDisplay: `$${dollars} POT · ${nickels} NKL`,
    wagerUnitLabel: "NICKELS (NKL)",
    showWhopCheckout: true,
    showNickelPoints: true,
    seasonPrizeHeadline: `$${dollars} Whop Pot won by Season Nickel Point Leader`,
  };
}

export function normalizePhoneE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw.startsWith("+") ? raw.trim() : `+${digits}`;
}

export function normalizeKrillionAnswer(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}
