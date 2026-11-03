/** Accès aux hypothèses de vente depuis les écrans. Les calculs sont tous dans le moteur. */
import { defaultAssumptions } from '../db/defaultAssumptions';
import type { Dataset, Property, PropertyAssumptions } from '../engine/types';

/** Hypothèses de simulation du bien (valeurs par défaut s'il n'en a pas encore). */
export function assumptionsOf(data: Dataset, property: Property): PropertyAssumptions {
  return (
    data.assumptions.find((a) => a.propertyId === property.id) ?? defaultAssumptions(property.id)
  );
}
