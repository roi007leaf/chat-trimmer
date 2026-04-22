export function hasActiveCombatEncounter() {
  return Boolean(game.combat?.active || game.combats?.some((combat) => combat.active));
}

export function shouldSkipAutoTrim({
  autoTrimMethod,
  disableDuringEncounter,
  hasActiveCombat,
}) {
  if (autoTrimMethod === "disabled") return false;
  return Boolean(disableDuringEncounter && hasActiveCombat);
}
