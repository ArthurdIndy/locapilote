import { useEffect, useRef, useState } from 'react';
import { useCurrentPropertyContext } from '../propertyContext';

/**
 * Titre d'une page d'un bien, sur une seule ligne : « Opérations · Appartement exemple ». Avec
 * plusieurs biens, le nom du bien (même police que le titre, suivi d'un ▾ discret) ouvre au clic
 * le menu des biens (titre-sélecteur). Un nom trop long est tronqué avec « … ».
 */
export function PropertyTitle({ title }: { title: string }) {
  const { properties, current, setCurrentId } = useCurrentPropertyContext();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);

  // Le menu se referme au clic ailleurs et avec Échap.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!current) return <h2>{title}</h2>;

  return (
    <h2 className="property-title">
      <span className="property-title-prefix">{title} ·&nbsp;</span>
      {properties.length < 2 ? (
        <span className="property-title-name">{current.name}</span>
      ) : (
        <span className="property-title-picker" ref={wrapper}>
          <button
            type="button"
            className="property-title-button"
            aria-haspopup="menu"
            aria-expanded={open}
            title="Changer de bien"
            onClick={() => setOpen((o) => !o)}
          >
            <span className="property-title-name">{current.name}</span>
            <span className="property-title-caret" aria-hidden="true">
              ▾
            </span>
          </button>
          {open && (
            <ul className="property-menu" role="menu" aria-label="Choisir le bien">
              {properties.map((p) => (
                <li key={p.id} role="none">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={p.id === current.id}
                    onClick={() => {
                      setCurrentId(p.id);
                      setOpen(false);
                    }}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </span>
      )}
    </h2>
  );
}
