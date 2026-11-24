const PLAN_LABELS = {
  free: '무료',
  pro: '프로',
  team: '팀',
};

/** Korean display label for a plan id. An unknown id is shown as-is. */
export function planLabel(plan) {
  return PLAN_LABELS[plan] ?? plan;
}
