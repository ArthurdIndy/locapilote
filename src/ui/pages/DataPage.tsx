import { useRef, useState, type ChangeEvent } from 'react';
import { BackupError, parseBackup } from '../../db/backup';
import { transactionsToCsv } from '../../db/csv';
import { db } from '../../db/database';
import type { Dataset } from '../../engine/types';
import { recordBackup } from '../backupReminder';
import { Modal } from '../components/Modal';
import { downloadBackup, loadExample } from '../dataActions';
import { describeAllData } from '../dataSummary';
import { downloadText } from '../download';

type Status = { kind: 'success' | 'error'; text: string } | null;

function describe(data: Dataset): string {
  const p = data.properties.length;
  const t = data.transactions.length;
  return `${p} bien${p > 1 ? 's' : ''}, ${t} opération${t > 1 ? 's' : ''}, ${data.loanInstallments.length} échéances de prêt`;
}

export function DataPage({ data, today }: { data: Dataset; today: string }) {
  const [status, setStatus] = useState<Status>(null);
  const [confirmingExample, setConfirmingExample] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const exportJson = async () => {
    // Relecture directe de la base : l'export contient exactement ce qui est stocké.
    await downloadBackup(today);
    setStatus({ kind: 'success', text: 'Sauvegarde téléchargée.' });
  };

  const exportCsv = async () => {
    downloadText(
      `locapilote-operations-${today}.csv`,
      transactionsToCsv(await db.readAll()),
      'text/csv;charset=utf-8',
    );
    setStatus({ kind: 'success', text: 'Fichier CSV des opérations téléchargé.' });
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
      recordBackup(today);
      setStatus({ kind: 'success', text: `Import terminé : ${describe(backup.data)}.` });
    } catch (e) {
      const text =
        e instanceof BackupError
          ? e.message
          : `Import impossible : ${e instanceof Error ? e.message : String(e)}`;
      setStatus({ kind: 'error', text: `${text} Aucune donnée n’a été modifiée.` });
    }
  };

  const replaceWithExample = async () => {
    await loadExample(today);
    setConfirmingExample(false);
    setStatus({ kind: 'success', text: 'Exemple chargé.' });
  };

  // Sans données, l'exemple se charge directement ; sinon, une confirmation.
  const hasData = data.properties.length > 0 || data.transactions.length > 0;
  const askExample = () => (hasData ? setConfirmingExample(true) : void replaceWithExample());

  return (
    <div className="stack">
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
        <h3>Opérations pour Excel</h3>
        <p>
          Toutes les opérations dans un fichier CSV qui s’ouvre directement dans Excel (colonnes
          séparées par des points-virgules, montants avec une virgule).
        </p>
        <button type="button" className="button" onClick={exportCsv}>
          Exporter les opérations (CSV)
        </button>
      </section>

      <section className="card">
        <h3>Exemple</h3>
        <p>Remplace toutes les données par un appartement fictif, pour découvrir l’outil.</p>
        <button type="button" className="button danger" onClick={askExample}>
          Charger l’exemple
        </button>
      </section>

      {confirmingExample && (
        <Modal
          title="Remplacer tes données par l’exemple ?"
          onClose={() => setConfirmingExample(false)}
        >
          <p>
            Tes données actuelles ({describeAllData(data)}) seront effacées de ce navigateur. Tu
            pourras les retrouver seulement avec une sauvegarde.
          </p>
          <div className="actions">
            <button type="button" className="button" onClick={() => setConfirmingExample(false)}>
              Annuler
            </button>
            <button type="button" className="button" onClick={() => void downloadBackup(today)}>
              Exporter d’abord
            </button>
            <button type="button" className="button danger-solid" onClick={replaceWithExample}>
              Remplacer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
