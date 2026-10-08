import type { TFunction } from 'i18next';
import type { Scope } from '../api/types';

/** Radii are stored in km. Show them in the unit the admin chose (Settings › Location). */
export const formatDistance = (km: number, unit: 'km' | 'mi' = 'km') => (unit === 'mi' ? `${Math.round(km * 0.621371)} mi` : `${km} km`);

/** Short text for a scope: "25 km", "Whole state"… */
export const scopeText = (scope: Scope | undefined, unit: 'km' | 'mi' | undefined, t: TFunction) => {
  if (!scope || scope.type === 'radius') return formatDistance(scope?.km ?? 0, unit);
  return t(`location.scope_${scope.type}`);
};
