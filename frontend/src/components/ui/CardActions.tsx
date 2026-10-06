import { Pencil, Trash2 } from "lucide-react";

type Props = {
  /** Names the thing for screen readers and tooltips, e.g. "Ravi Kumar" */
  label: string;
  onEdit: () => void;
  onDelete: () => void;
};

/**
 * Edit / Delete icon buttons that sit in the top-right corner of a card.
 * Render it as a sibling of the card's own button (a button can't contain buttons);
 * the card's <li> needs `position: relative` (the `.has-actions` class does that).
 */
export default function CardActions({ label, onEdit, onDelete }: Props) {
  return (
    <div className="card-actions">
      <button type="button" className="card-action" aria-label={`Edit ${label}`} title="Edit" onClick={onEdit}>
        <Pencil size={14} strokeWidth={1.75} />
      </button>
      <button type="button" className="card-action danger" aria-label={`Delete ${label}`} title="Delete" onClick={onDelete}>
        <Trash2 size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}
