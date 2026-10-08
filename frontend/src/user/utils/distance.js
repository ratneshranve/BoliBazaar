/** Radii are stored in km. Show them in the unit the admin chose (Settings › Location). */
export const formatDistance = (km, unit = 'km') => (unit === 'mi' ? `${Math.round(km * 0.621371)} mi` : `${km} km`);

/** Short text for a scope: "25 km", "Whole state"… (the wide-area words come from the translated strings) */
export const scopeText = (scope, unit, t) => {
  if (!scope || scope.type === 'radius') return formatDistance(scope?.km ?? 0, unit);
  return t(`location.scope_${scope.type}`);
};
