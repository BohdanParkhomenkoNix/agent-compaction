// The compaction policy every adapter applies. Claude Code applies it natively through
// the environment `ag` sets (window 300000, percent 85); the values must stay equal.
export interface Policy {
  readonly cap: number
  readonly percent: number
  readonly outputReserveMax: number
  readonly buffer: number
  readonly skillTokens: number
  readonly skillBudget: number
}

export const POLICY: Policy = {
  cap: 300_000,
  percent: 85,
  outputReserveMax: 20_000,
  buffer: 13_000,
  skillTokens: 5_000,
  skillBudget: 25_000,
}

// Claude Code 2.1.300: the percent applies to the window minus the output reserve,
// and the threshold never comes closer than `buffer` to that.
export function threshold(context: number, maxOutput: number | undefined, policy: Policy = POLICY): number {
  const window = Math.min(context, policy.cap)
  const effective = window - Math.min(maxOutput ?? policy.outputReserveMax, policy.outputReserveMax)
  return Math.min(Math.floor((effective * policy.percent) / 100), effective - policy.buffer)
}
