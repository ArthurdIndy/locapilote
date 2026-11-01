import { useRef, useState, type ChangeEvent } from 'react';
import { BackupError, buildBackup, parseBackup, serializeBackup } from '../../db/backup';
import { transactionsToCsv } from '../../db/csv';
import { db } from '../../db/database';
import { startWithTestDataset } from '../../db/setup';
import type { Dataset } from '../../engine/types';
import { downloadText } from '../download';

type Status = { kind: 'success' | 'error'; text: string } | null;

function describe(data: Dataset): string {
  const p = data.properties.length;
  const t = data.transactions.length;
  return `${p} bien${p > 1 ? 's' : ''}, ${t} mouvement${t > 1 ? 's' : ''}, ${data.loanInstallments.length} échéances de prêt`;
}

export function DataPage({ data, today }: { data: Dataset; today: string }) {
  const [status, setStatus] = useState<Status>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const exportJson = async () => {
    // Relecture directe de la base : l'export contient exactement ce qui est stocké.
    const backup = buildBackup(await db.readAll());
    downloadText(
      `locapilote-sauvegarde-${today}.json`,
      serializeBackup(backup),
      'application/json',
    );
    setStatus({ kind: 'success', text: 'Sauvegarde téléchargée.' });
  };

  const exportCsv = async () => {
    downloadText(
      `locapilote-mouvements-${today}.csv`,
      transactionsToCsv(await db.readAll()),
      'text/csv;charset=utf-8',
    );
    setStatus({ kind: 'success', text: 'Fichier CSV des mouvements téléchargé.' });
  };

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // pour pouvoir choisir à nouveau le même fichier
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      const ok = window.confirm(
        `Remplacer toutes tes données par celles du fichier « ${file.name} » ?\n\n` +
          `Le fichier contient : ${describe(backup.data)}.\n` +
          `Tes données actuelles (${describe(data)}) seront effacées.\n\n` +
          'Conseil : exporte d’abord une sauvegarde.',
      );
      if (!ok) return;
      await db.replaceAll(backup.data);
      setStatus({ kind: 'success', text: `Import terminé : ${describe(backup.data)}.` });
    } catch (e) {
      const text =
        e instanceof BackupError
          ? e.message
          : `Import impossible : ${e instanceof Error ? e.message : String(e)}`;
      setStatus({ kind: 'error', text: `${text} Aucune donnée n’a été modifiée.` });
    }
  };

  const loadTestData = async () => {
    const ok = window.confirm(
      'Remplacer toutes tes données par le jeu de test ?\n\n' +
        `Tes données actuelles (${describe(data)}) seront effacées.`,
    );
    if (!ok) return;
    await startWithTestDataset(db);
    setStatus({ kind: 'success', text: 'Jeu de test chargé.' });
  };

  return (
    <div className="stack">
      <h2>Données</h2>
      {status && (
        <p className={status.kind === 'success' ? 'success' : 'error-text'} role="status">
          {status.text}
        </p>
      )}

      <section className="card">
        <h3>Sauvegarde complète</h3>
        <p>
          Un fichier JSON avec toutes tes données ({describe(data)}). Garde-le en lieu sûr : il
          permet de tout retrouver sur un autre appareil ou un autre navigateur.
        </p>
        <button type="button" className="button primary" onClick={exportJson}>
          Exporter toutes mes données (JSON)
        </button>
      </section>

      <section className="card">
        <h3>Restaurer une sauvegarde</h3>
        <p>
          Importer un fichier exporté depuis Locapilote <strong>remplace toutes les données</strong>{' '}
          de ce navigateur. Une confirmation est demandée.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          onChange={importJson}
          hidden
        />
        <button type="button" className="button" onClick={() => fileInput.current?.click()}>
          Importer une sauvegarde…
        </button>
      </section>

      <section className="card">
        <h3>Mouvements pour Excel</h3>
        <p>
          Tous les mouvements dans un fichier CSV qui s’ouvre directement dans Excel (colonnes
          séparées par des points-virgules, montants avec une virgule).
        </p>
        <button type="button" className="button" onClick={exportCsv}>
          Exporter les mouvements (CSV)
        </button>
      </section>

      <section className="card">
        <h3>Jeu de test</h3>
        <p>Remplace toutes les données par l’appartement fictif du jeu de test.</p>
        <button type="button" className="button danger" onClick={loadTestData}>
          Charger le jeu de test
        </button>
      </section>
    </div>
  );
}
