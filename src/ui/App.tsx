import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type ReactNode } from 'react';
import type { Dataset } from '../engine/types';
import { db } from '../db/database';
import { useCurrentProperty } from './currentProperty';
import { CurrentPropertyContext } from './propertyContext';
import { todayIso } from './format';
import { BudgetPage } from './pages/BudgetPage';
import { HomePage } from './pages/HomePage';
import { NewTransactionPage } from './pages/NewTransactionPage';
import { MyPropertyPage } from './pages/MyPropertyPage';
import { SettingsPage } from './pages/SettingsPage';
import { SimulationsPage } from './pages/SimulationsPage';
import { SynthesisPage } from './pages/SynthesisPage';
import { TaxPage } from './pages/TaxPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { WelcomePage } from './pages/WelcomePage';
import {
  MAIN_NAV,
  routeHref,
  SECONDARY_NAV,
  useLocation,
  type Location,
  type RouteId,
} from './router';

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
  const location = useLocation();

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
  return <MainApp data={state.data} location={location} />;
}

function MainApp({ data, location }: { data: Dataset; location: Location }) {
  const { route, params } = location;
  const { current, setCurrentId } = useCurrentProperty(data.properties);
  const today = todayIso();

  // Un lien vers les opérations d'un bien (#/operations?bien=…) rend ce bien courant.
  // Relu à chaque changement d'adresse, même quand on revient sur le même lien après avoir
  // changé de bien entre-temps.
  useEffect(() => {
    const requestedId = location.params.get('bien');
    if (requestedId && data.properties.some((p) => p.id === requestedId)) {
      setCurrentId(requestedId);
    }
  }, [location, data.properties, setCurrentId]);

  return (
    <CurrentPropertyContext.Provider value={{ properties: data.properties, current, setCurrentId }}>
      <Layout route={route}>
        {route === 'accueil' && <HomePage data={data} onOpen={setCurrentId} />}
        {route === 'nouvelle-operation' && (
          <NewTransactionPage data={data} currentPropertyId={current?.id ?? null} today={today} />
        )}
        {route === 'operations' && (
          <TransactionsPage
            key={location.key}
            data={data}
            currentPropertyId={current?.id ?? null}
            today={today}
            params={params}
          />
        )}
        {route === 'synthese' && <SynthesisPage data={data} property={current} today={today} />}
        {route === 'budget' && <BudgetPage property={current} />}
        {route === 'fiscalite' && <TaxPage data={data} property={current} today={today} />}
        {route === 'simulations' && (
          <SimulationsPage data={data} property={current} today={today} />
        )}
        {route === 'mon-bien' && (
          <MyPropertyPage
            data={data}
            property={current}
            today={today}
            params={params}
            onCreated={setCurrentId}
          />
        )}
        {route === 'parametres' && <SettingsPage data={data} today={today} />}
      </Layout>
    </CurrentPropertyContext.Provider>
  );
}

interface LayoutProps {
  route?: RouteId;
  children: ReactNode;
}

/** Entrées du menu ☰ (téléphone) : tout ce qui n'est pas en onglet, puis ⚙. */
const PHONE_MENU: readonly { id: RouteId; label: string }[] = [
  ...SECONDARY_NAV,
  { id: 'operations', label: 'Toutes les opérations' },
  { id: 'parametres', label: '⚙ Paramètres' },
];

/** Bouton « + Opération » : ouvre directement le formulaire de saisie, depuis toute page. */
function NewTransactionLink({ route, className }: { route: RouteId; className: string }) {
  return (
    <a
      className={`${className} new-transaction-link`}
      href={routeHref('nouvelle-operation')}
      title="Saisir une recette ou une dépense"
      aria-current={route === 'nouvelle-operation' ? 'page' : undefined}
    >
      + Opération
    </a>
  );
}

function Layout({ route, children }: LayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Le menu ☰ se referme avec Échap.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const inPhoneMenu = PHONE_MENU.some((r) => r.id === route);

  return (
    <div className="page">
      <header className="header">
        <div className="header-top">
          <div className="brand">
            <h1>Locapilote</h1>
            <p className="tagline">Piloter un logement en location</p>
          </div>
          {route && (
            <div className="header-tools">
              {/* Téléphone : « + Opération » et ☰ dans la barre du haut. */}
              <NewTransactionLink route={route} className="button primary phone-only" />
              <button
                type="button"
                className={inPhoneMenu ? 'menu-button active' : 'menu-button'}
                aria-label="Menu"
                aria-expanded={menuOpen}
                aria-controls="menu-telephone"
                onClick={() => setMenuOpen((open) => !open)}
              >
                ☰
              </button>
            </div>
          )}
        </div>
        {route && menuOpen && (
          <nav id="menu-telephone" className="phone-menu" aria-label="Menu">
            {PHONE_MENU.map((r) => (
              <a
                key={r.id}
                href={routeHref(r.id)}
                aria-current={r.id === route ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {r.label}
              </a>
            ))}
          </nav>
        )}
        {route && (
          <nav className="nav" aria-label="Navigation principale">
            {MAIN_NAV.map((r) => (
              <a
                key={r.id}
                href={routeHref(r.id)}
                aria-current={r.id === route ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {r.label}
              </a>
            ))}
            {/* Ordinateur : à droite, plus discret. Sur téléphone, dans le menu ☰. */}
            <span className="nav-secondary">
              {SECONDARY_NAV.map((r) => (
                <a
                  key={r.id}
                  href={routeHref(r.id)}
                  aria-current={r.id === route ? 'page' : undefined}
                >
                  {r.label}
                </a>
              ))}
              <NewTransactionLink route={route} className="button primary small" />
              <a
                className="settings-link"
                href={routeHref('parametres')}
                aria-label="Paramètres"
                title="Paramètres : données (export, import, jeu de test)"
                aria-current={route === 'parametres' ? 'page' : undefined}
              >
                ⚙
              </a>
            </span>
          </nav>
        )}
      </header>
      <main>{children}</main>
      <footer className="footer">
        Tes données restent dans ce navigateur, sur cet appareil. Pense à les exporter régulièrement
        depuis <a href={routeHref('parametres')}>⚙ Paramètres</a>.
      </footer>
    </div>
  );
}
