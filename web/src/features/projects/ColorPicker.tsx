/**
 * @author Saaqib Shaik
 * @description Swatch picker for a project card's accent color (plus a custom color well). Each swatch has
 *   a text label and a check mark so the choice never depends on color perception alone.
 * @traces SE-FR-17, UC-13, SE-FR-15
 */
import { Icon } from '../../shared/ui';
import { CARD_COLORS } from './model';

export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Card color">
      {CARD_COLORS.map((hex) => (
        <button
          key={hex}
          type="button"
          role="radio"
          aria-checked={value.toUpperCase() === hex}
          aria-label={`Color ${hex}`}
          title={hex}
          onClick={() => onChange(hex)}
          className="flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition hover:scale-110 focus-visible:ring-2"
          style={{ background: hex, boxShadow: value.toUpperCase() === hex ? `0 0 0 2px rgb(var(--c-surface)), 0 0 0 4px ${hex}` : undefined }}
        >
          {value.toUpperCase() === hex ? <Icon name="check" className="h-3.5 w-3.5 text-white" /> : null}
        </button>
      ))}
      <label className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-dashed border-line text-muted" title="Custom color">
        <Icon name="palette" className="h-3.5 w-3.5" />
        <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label="Custom color" />
      </label>
    </div>
  );
}
