import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import type { Dataset } from '../engine/types';
import { db } from '../db/database';
import { useCurrentProperty } from './currentProperty';
import { todayIso } from './format';
import { DataPage } from './pages/DataPage';
import { HomePage } from './pages/HomePage';
import { PropertiesPage } from './pages/PropertiesPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { WelcomePage } from './pages/WelcomePage';
import { ROUTES, routeHref, useRoute, type RouteId } from './router';

type LoadState =
  { status: 'ready'; initialized: boolean; data: Dataset } | { status: 'error'; message: string };

async function load(): Promise<LoadState> {
  try {
    const initialized = await db.isInitialized();
    const data = await db.readAll();
    // Biens affichés par ordre alphabétique, partout.
    data.properties.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return { status: 'ready', initialized, data };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

export function App() {
  // Relue automatiquement à chaque modification de la base : toutes les vues restent à jour.
  const state = useLiveQuery(load);
  const route = useRoute();

  if (state === undefined) {
    return (
      <Layout>
        <p className="muted">Chargement…</p>
      </Layout>
    );
  }
  if (state.status === 'error') {
    return (
      <Layout>
        <div className="card error">
          <h2>Impossible d’ouvrir les données</h2>
          <p>
            Ce navigateur bloque le stockage local (navigation privée, ou cookies désactivés pour ce
            site). Essaie dans une fenêtre normale.
          </p>
          <p className="muted small">Détail : {state.message}</p>
        </div>
      </Layout>
    );
  }
  if (!state.initialized) {
    return (
      <Layout>
        <WelcomePage />
      </Layout>
    );
  }
  return <MainApp data={state.data} route={route} />;
}

function MainApp({ data, route }: { data: Dataset; route: RouteId }) {
  const { current, setCurrentId } = useCurrentProperty(data.properties);
  const today = todayIso();

  return (
    <Layout
      route={route}
      propertySelector={
        data.properties.length > 1 && current ? (
          <label className="current-property">
            <span>Bien courant</span>
            <select value={current.id} onChange={(e) => setCurrentId(e.target.value)}>
              {data.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null
      }
    >
      {route === 'accueil' && <HomePage data={data} today={today} />}
      {route === 'biens' && <PropertiesPage data={data} onCreated={setCurrentId} />}
      {route === 'mouvements' && (
        <TransactionsPage data={data} currentPropertyId={current?.id ?? null} today={today} />
      )}
      {route === 'donnees' && <DataPage data={data} today={today} />}
    </Layout>
  );
}

interface LayoutProps {
  route?: RouteId;
  propertySelector?: ReactNode;
  children: ReactNode;
}

function Layout({ route, propertySelector, children }: LayoutProps) {
  return (
    <div className="page">
      <header className="header">
        <div className="header-top">
          <div>
            <h1>Locapilote</h1>
            <p className="tagline">Piloter un logement en location</p>
          </div>
          {propertySelector}
        </div>
        {route && (
          <nav className="nav" aria-label="Navigation principale">
            {ROUTES.map((r) => (
              <a
                key={r.id}
                href={routeHref(r.id)}
                aria-current={r.id === route ? 'page' : undefined}
              >
                {r.label}
              </a>
            ))}
          </nav>
        )}
      </header>
      <main>{children}</main>
      <footer className="footer">
        Tes données restent dans ce navigateur, sur cet appareil. Pense à les exporter régulièrement
        depuis la page <a href={routeHref('donnees')}>Données</a>.
      </footer>
    </div>
  );
}
