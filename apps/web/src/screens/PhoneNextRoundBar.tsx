// The VIP's way out of the finale, pinned to the bottom of the results screen.
import { useLocale } from "@opg/i18n";
import { Button, Icon } from "@opg/ui";

export interface PhoneNextRoundBarProps {
  onNextRound: () => void;
}

/**
 * The VIP watches the same finale as everyone else and then has to drive the next round, so
 * the way on has to be on that screen. It used to be a second full phone column stacked under
 * the results — a 200dvh document whose only cue that anything followed was the seam between
 * two notebook pages, which on a phone you cannot see.
 *
 * It rides in `PhoneResults`' `footer` slot, in flow, and that is load-bearing rather than
 * incidental. Pinning it to the viewport instead reserves no space, so it sat on top of the
 * bottom of the results column: with eight players the last standings row was underneath it,
 * and hit-testing the middle of that row returned this button. Rendering it in flow is what
 * makes the column end above the bar instead of behind it.
 */
export function PhoneNextRoundBar({ onNextRound }: PhoneNextRoundBarProps) {
  const { t } = useLocale();
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "10px 18px calc(10px + env(safe-area-inset-bottom, 0px))",
        // Bleeds back out through the column's own 18px gutter, so the band still spans the
        // full width the way a footer should, even though it is no longer pinned to the screen.
        marginInline: -18,
        background: "var(--opg-paper)",
        borderBlockStart: "4px solid var(--opg-ink)",
      }}
    >
      <Button
        size="lg"
        fullWidth
        onClick={onNextRound}
        style={{ maxWidth: 444 }}
      >
        <Icon name="arrow-right" size={24} color="var(--opg-paper)" />
        <span>{t.status.nextRound}</span>
      </Button>
    </div>
  );
}
