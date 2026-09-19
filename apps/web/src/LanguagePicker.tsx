// Hebrew ships in the bundle, so the only thing between a player and a translated game is a
// way to ask for it. The locale is never guessed from `navigator.language`: direction is set
// on the document, so picking Hebrew mirrors every screen, and that should be a choice.
import { LOCALES, LOCALE_NAMES, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";

/** A language names itself in its own language, so `LOCALE_NAMES` is never translated. */
export function LanguagePicker({ t }: { t: Dictionary }) {
  const { locale, setLocale } = useLocale();
  return (
    <fieldset
      style={{
        display: "flex",
        gap: 6,
        margin: 0,
        padding: 0,
        border: "none",
      }}
    >
      <legend
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
        }}
      >
        {t.common.languageLabel}
      </legend>
      {LOCALES.map((option) => (
        <LanguageOption
          key={option}
          name={LOCALE_NAMES[option]}
          selected={option === locale}
          onSelect={() => {
            setLocale(option);
          }}
        />
      ))}
    </fieldset>
  );
}

interface LanguageOptionProps {
  name: string;
  selected: boolean;
  onSelect: () => void;
}

/** Selected state reads from the ink weight and `aria-pressed`, never from colour alone. */
function LanguageOption({ name, selected, onSelect }: LanguageOptionProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      style={{
        minHeight: 44,
        minWidth: 44,
        padding: "0 12px",
        fontSize: 16,
        fontWeight: selected ? 700 : 400,
        color: selected ? "var(--opg-ink)" : "var(--opg-ink-secondary)",
        background: "transparent",
        border: `${selected ? 3 : 1}px solid var(--opg-ink)`,
        borderRadius: 10,
        cursor: "pointer",
      }}
    >
      {name}
    </button>
  );
}
