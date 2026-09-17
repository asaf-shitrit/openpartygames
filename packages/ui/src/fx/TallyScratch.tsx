// Tally marks that scratch in as votes land. Which marks are visible is driven
// by `drawn` from the beat timeline; marks that were already on screen when the
// component mounted render plain, so a reconnect mid-reveal never redraws them.
import { useState } from "react";

/** Gap between marker strokes in the tally geometry. */
const GAP = 20;
const INK = "#2B2B2B";

export interface TallyScratchProps {
    /** Final number of votes; sets the SVG width. */
    count: number;
    /** How many votes have landed so far. */
    drawn: number;
    /** Stroke height in px; the standard reveal tile uses 56. */
    size?: number;
    color?: string;
    label?: string;
}

function markPath(index: number, size: number): string {
    return `M${8 + index * GAP} 6 l-3 ${size - 12}`;
}

function votesLabel(shown: number): string {
    return shown === 1 ? "1 vote" : `${shown} votes`;
}

export function TallyScratch({
    count,
    drawn,
    size = 56,
    color,
    label,
}: TallyScratchProps) {
    const shown = Math.min(Math.max(0, drawn), count);
    // Marks visible on the first render must not replay the scratch on reconnect.
    const [drawnAtMount] = useState(shown);
    const marks = Array.from({ length: shown }, (_, index) => ({
        key: markPath(index, size),
        scratched: index >= drawnAtMount,
    }));
    const accessibleLabel = label ?? votesLabel(shown);
    return (
        <svg
            width={count * GAP}
            height={size}
            viewBox={`0 0 ${count * GAP} ${size}`}
            fill="none"
            stroke={color ?? INK}
            strokeWidth={5}
            strokeLinecap="round"
            aria-label={accessibleLabel}
            style={{ flexShrink: 0 }}
        >
            <title>{accessibleLabel}</title>
            {marks.map((mark) => (
                <path
                    key={mark.key}
                    d={mark.key}
                    className={mark.scratched ? "opg-draw" : undefined}
                    pathLength={mark.scratched ? 1 : undefined}
                />
            ))}
        </svg>
    );
}
