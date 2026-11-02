/**
 * Accès aux simulations de vente depuis les écrans : hypothèses du bien, placement de
 * référence, et « si je vends aujourd'hui ». Les calculs sont tous dans le moteur.
 */
import { defaultAssumptions, effectiveDataAsOf } from '../db/defaultAssumptions';
import {
  isSaleSimulation,
  simulateSale,
  type ReferenceInvestment,
  type SaleSimulation,
} from '../engine/sale-simulation';
import type { Dataset, IsoDate, Property, PropertyAssumptions } from '../engine/types';

/** Hypothèses de simulation du bien (valeurs par défaut s'il n'en a pas encore). */
export function assumptionsOf(data: Dataset, property: Property): PropertyAssumptions {
  return (
    data.assumptions.find((a) => a.propertyId === property.id) ?? defaultAssumptions(property.id)
  );
}

/** Placement de référence saisi dans ⚙ Paramètres ; `null` tant qu'il n'est pas renseigné. */
export function referenceInvestment(data: Dataset): ReferenceInvestment | null {
  const settings = data.householdSettings[0];
  if (!settings || settings.referenceRate === null) return null;
  return { rate: settings.referenceRate, label: settings.referenceLabel.trim() };
}

/**
 * Vente à la date du jour, au prix de la valeur estimée du bien. `null` si le bien n'a pas de
 * valeur estimée ou si la date du jour précède l'achat.
 */
export function saleToday(
  data: Dataset,
  property: Property,
  today: IsoDate,
): SaleSimulation | null {
  if (property.estimatedValue <= 0) return null;
  const assumptions = assumptionsOf(data, property);
  const asOf = effectiveDataAsOf(data.assumptions, property.id, today).date;
  const result = simulateSale(
    data,
    property,
    assumptions,
    asOf,
    { date: today, price: property.estimatedValue },
    referenceInvestment(data),
  );
  return isSaleSimulation(result) ? result : null;
}
