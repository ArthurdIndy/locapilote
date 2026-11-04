/** Libellé d'une ligne qui a un détail replié : un bouton ⊕ / ⊖ (fermé par défaut). */
export function DisclosureButton({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="disclosure" aria-expanded={open} onClick={onToggle}>
      {label}
      <span className="disclosure-sign" aria-hidden="true">
        {open ? '⊖' : '⊕'}
      </span>
    </button>
  );
}
