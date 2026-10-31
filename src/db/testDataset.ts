import seed from '../../data/seed.json';
import type { Dataset } from '../engine/types';
import { parseSeed, type RawSeed } from './seed';

/** Le jeu de test anonymisé, converti au modèle de Locapilote. */
export function loadTestDataset(): Dataset {
  return parseSeed(seed as RawSeed);
}
