export let scoreFloorRatio = 0.15

export function apply(input: { score_floor?: number }) {
  if (input.score_floor === undefined) return
  scoreFloorRatio = input.score_floor
}
