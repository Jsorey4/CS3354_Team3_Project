/**
 * @author Tyler Gaines
 * @description Appearance controls in the style of profile.html's preference rows: a Dark theme switch and
 *   the color-vision palette picker (None, Protanopia, Deuteranopia, Tritanopia, High contrast) with a live
 *   preview of the status colors, so the user sees the difference before leaving the page.
 * @traces SE-FR-14, SE-FR-15
 */
import type { ColorBlindMode, Theme } from '../../shared/types';
import { Badge, Icon, Toggle } from '../../shared/ui';

export const COLOR_BLIND_OPTIONS: { value: ColorBlindMode; label: string; hint: string }[] = [
  { value: 'none', label: 'None', hint: 'Standard palette' },
  { value: 'deuteranopia', label: 'Deuteranopia', hint: 'Green-weak: blue / orange status colors' },
  { value: 'protanopia', label: 'Protanopia', hint: 'Red-weak: blue / orange status colors' },
  { value: 'tritanopia', label: 'Tritanopia', hint: 'Blue-yellow weak: teal / magenta status colors' },
  { value: 'high_contrast', label: 'High contrast', hint: 'Stronger text, borders and focus rings' },
];

export function ThemeToggle({ value, onChange }: { value: Theme; onChange: (t: Theme) => void }) {
  return (
    <div className="flex h-14 items-center justify-between gap-3 border-b border-line">
      <div className="flex items-center gap-3">
        <Icon name={value === 'dark' ? 'moon' : 'sun'} className="h-5 w-5 text-accent" />
        <div>
          <p className="text-[15px] font-semibold leading-[22px] text-ink">Dark theme</p>
          <p className="text-[13px] leading-[18px] text-muted">{value === 'dark' ? 'Midnight navy (default)' : 'Light theme is on'}</p>
        </div>
      </div>
      <Toggle checked={value === 'dark'} onChange={(on) => onChange(on ? 'dark' : 'light')} label="Dark theme" />
    </div>
  );
}

export function ColorBlindPicker({ value, onChange }: { value: ColorBlindMode; onChange: (m: ColorBlindMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Color vision mode">
      {COLOR_BLIND_OPTIONS.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className="flex min-h-14 w-full items-center gap-3 border-b border-line py-2 text-left last:border-b-0"
          >
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px] ${on ? 'border-accent bg-accent text-canvas' : 'border-line-strong'}`}>
              {on ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
            </span>
            <span>
              <span className="block text-[15px] font-semibold text-ink">{o.label}</span>
              <span className="block text-[13px] text-muted">{o.hint}</span>
            </span>
          </button>
        );
      })}
      <div className="flex flex-wrap gap-2 pt-4" aria-label="Preview">
        <Badge tone="ok" icon="check">On track</Badge>
        <Badge tone="warn" icon="alert">Due soon</Badge>
        <Badge tone="danger" icon="flag">Overdue</Badge>
        <Badge tone="info" icon="play">In progress</Badge>
      </div>
    </div>
  );
}
