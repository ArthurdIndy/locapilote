import { useState } from 'react';
import type { Dataset } from '../../engine/types';
import { goBack, propertyHref, routeHref } from '../router';
import { TransactionForm } from './TransactionForm';

interface Props {
  data: Dataset;
  currentPropertyId: string | null;
  today: string;
}

/**
 * « + Opération » : le formulaire de saisie d'une recette ou d'une dépense, ouvert depuis
 * n'importe quelle page. Après l'enregistrement, le formulaire reste ouvert pour la suivante ;
 * « Fermer » ramène à la page d'où l'on vient.
 */
export function NewTransactionPage({ data, currentPropertyId, today }: Props) {
  const [message, setMessage] = useState<string | null>(null);

  const allLink = (
    <a className="all-transactions-link" href={routeHref('operations')}>
      Toutes les opérations ›
    </a>
  );

  if (data.properties.length === 0) {
    return (
      <section className="card">
        <h2>Nouvelle opération</h2>
        <p>Crée d’abord un bien : chaque opération y est rattachée.</p>
        <a className="button primary" href={propertyHref('informations')}>
          Créer un bien
        </a>
      </section>
    );
  }

  return (
    <div className="stack">
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      <TransactionForm
        data={data}
        initial={null}
        defaultPropertyId={currentPropertyId ?? data.properties[0]!.id}
        today={today}
        onClose={goBack}
        onSaved={setMessage}
        aside={allLink}
      />
    </div>
  );
}
