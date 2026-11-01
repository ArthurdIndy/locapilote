import { useCurrentPropertyContext } from '../propertyContext';

/**
 * Titre d'une page d'un bien : « Synthèse · Appartement exemple ». Avec plusieurs biens, le nom
 * est un menu déroulant qui change le bien courant (titre-sélecteur).
 */
export function PropertyTitle({ title }: { title: string }) {
  const { properties, current, setCurrentId } = useCurrentPropertyContext();
  if (!current) return <h2>{title}</h2>;
  if (properties.length < 2) {
    return (
      <h2>
        {title} · {current.name}
      </h2>
    );
  }
  return (
    <h2 className="title-selector">
      {title} ·{' '}
      <select
        aria-label="Bien courant"
        value={current.id}
        onChange={(e) => setCurrentId(e.target.value)}
      >
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </h2>
  );
}
