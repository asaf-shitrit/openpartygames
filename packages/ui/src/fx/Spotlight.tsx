// Spotlight: dims the whole stage except circular holes over the targets, so the
// tiles under a hole stay fully visible. Targets move with the beats, and the
// circles animate between positions because they are keyed by id.
import { useId } from "react";

export interface SpotlightTarget {
      id: string;
      /** Circle center in the positioned parent's px space. */
      x: number;
      y: number;
      /** Hole radius in px. */
      radius: number;
}

export interface SpotlightProps {
      on: boolean;
      targets: readonly SpotlightTarget[];
      /** Dim strength, 0-1. Default 0.55. */
      dim?: number;
}

export interface SpotlightMaskCircle {
      id: string;
      transform: string;
      r: number;
}

/** Mask holes for the targets; pure so the reveal beats can be tested directly. */
export function spotlightMaskCircles(
      targets: readonly SpotlightTarget[],
): SpotlightMaskCircle[] {
      return targets.map((target) => ({
            id: target.id,
            transform: `translate(${target.x}px, ${target.y}px)`,
            r: target.radius,
      }));
}

export function Spotlight({ on, targets, dim = 0.55 }: SpotlightProps) {
      const maskId = useId();
      const circles = spotlightMaskCircles(targets);
      return (
            <div
                  aria-hidden="true"
                  style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        opacity: on ? 1 : 0,
                        transition: "opacity 400ms var(--opg-ease-out)",
                  }}
            >
                  <svg
                        width="100%"
                        height="100%"
                        style={{ position: "absolute", inset: 0 }}
                  >
                        <mask id={maskId}>
                              <rect width="100%" height="100%" fill="white" />
                              {circles.map((circle) => (
                                    <circle
                                          key={circle.id}
                                          cx={0}
                                          cy={0}
                                          r={circle.r}
                                          fill="black"
                                          style={{
                                                transform: circle.transform,
                                                transition:
                                                      "transform 600ms var(--opg-ease-in-out), r 600ms var(--opg-ease-in-out)",
                                          }}
                                    />
                              ))}
                        </mask>
                        <rect
                              width="100%"
                              height="100%"
                              fill={`rgba(43,43,43,${dim})`}
                              mask={`url(#${maskId})`}
                        />
                  </svg>
            </div>
      );
}
