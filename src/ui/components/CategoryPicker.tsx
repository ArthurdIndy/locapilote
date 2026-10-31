import { forwardRef, useId, useMemo, useState, type KeyboardEvent } from 'react';
import type { Category } from '../../engine/types';
import { normalizeForSearch } from '../format';
import { DIRECTION_LABELS, sortCategories } from '../labels';

interface Props {
  categories: readonly Category[];
  value: string | null;
  onChange: (categoryId: string) => void;
  label: string;
}

/**
 * Liste de catégories avec recherche : on tape quelques lettres (sans accents),
 * on choisit avec les flèches et Entrée, ou au doigt.
 */
export const CategoryPicker = forwardRef<HTMLInputElement, Props>(function CategoryPicker(
  { categories, value, onChange, label },
  ref,
) {
  const listId = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const sorted = useMemo(() => sortCategories(categories), [categories]);
  const selected = categories.find((c) => c.id === value) ?? null;
  const matches = useMemo(() => {
    if (!query) return sorted;
    const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
    return sorted.filter((c) => {
      const haystack = normalizeForSearch(`${c.name} ${c.group}`);
      return words.every((w) => haystack.includes(w));
    });
  }, [sorted, query]);

  const choose = (category: Category) => {
    onChange(category.id);
    setQuery(null);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open) {
      const category = matches[active];
      if (category) {
        e.preventDefault();
        choose(category);
      }
    } else if (e.key === 'Escape') {
      setQuery(null);
      setOpen(false);
    }
  };

  const activeId = open && matches[active] ? `${listId}-${active}` : undefined;

  return (
    <div className="field combobox">
      <label htmlFor={`${listId}-input`}>{label}</label>
      <input
        ref={ref}
        id={`${listId}-input`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        placeholder="Tape pour chercher (ex. : loyer, taxe…)"
        value={query ?? selected?.name ?? ''}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        // Le focus seul n'ouvre pas la liste (elle cacherait le formulaire) : on tape ou on clique.
        onFocus={(e) => e.target.select()}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setQuery(null);
          setOpen(false);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul className="combobox-list" id={listId} role="listbox">
          {matches.length === 0 && <li className="muted">Aucune catégorie trouvée</li>}
          {matches.map((c, i) => {
            const previous = matches[i - 1];
            const header = !previous || previous.direction !== c.direction;
            return (
              <li
                key={c.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={c.id === value}
                className={i === active ? 'active' : undefined}
                data-group={header ? DIRECTION_LABELS[c.direction] : undefined}
                // mousedown plutôt que click : le choix est pris avant que le champ perde le focus.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(c);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span>{c.name}</span>
                <span className="muted small">{c.group}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});
