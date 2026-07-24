import {CSSProps} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {
    blindsAxis,
    BlindsOrientation,
    clamp01,
    maskStyle,
    wipeGradientDir,
} from "@core/elements/transition/transitions/image/transitionMaskUtils";

/**
 * A parametric coverage mask: the geometry vocabulary shared by the two
 * mask-driven transition engines — {@link Reveal} (direct A→B) and
 * {@link ThroughColor} (cover with a colour, swap, uncover). Built through the
 * static factories on {@link Mask} and passed to an engine's `pattern` option.
 *
 * Invariants every pattern upholds:
 * - `mask(0)` is fully transparent and `mask(1)` fully opaque, feather included —
 *   the soft band is swept completely off both ends of the run.
 * - The opaque fraction grows monotonically with `t`.
 * - `mask(t, true)` is the complementary orientation of the same geometry at the
 *   same coverage: a wipe grows from the opposite side, an iris closes from the
 *   rim instead of growing from the centre, a clock hand sweeps the other way.
 *   This is what lets {@link ThroughColor} continue a pattern through the hold
 *   instead of backing it out.
 */
export type MaskPattern = {
    /**
     * The CSS mask image whose opaque region covers fraction `t` (0–1) of the
     * frame. May be a comma-separated multi-layer image list.
     */
    mask(t: number, inverted?: boolean): string;
    /** `mask-size` for tiled patterns. @default "100% 100%" */
    size?: string;
    /** `mask-repeat` for tiled patterns. @default "no-repeat" */
    repeat?: string;
};

export type WipePatternOptions = {
    /**
     * Direction the covering edge travels toward — a keyword, or any CSS
     * gradient angle in degrees (`0` = up, `90` = right). @default "left"
     */
    direction?: TransformDefinitions.WipeDirection | number;
    /** Width of the soft edge band, in percent. Use `0` for a hard edge. @default 12 */
    feather?: number;
};

export type BarnDoorPatternOptions = {
    /** Travel axis of the doors, or any CSS gradient angle in degrees. @default "horizontal" */
    axis?: "horizontal" | "vertical" | number;
    /** Width of the soft edge band, in percent. @default 12 */
    feather?: number;
};

export type IrisPatternOptions = {
    /** Centre of the iris, as a CSS position. @default "50% 50%" */
    center?: string;
    /** Width of the soft edge band, in percent. Use `0` for a hard edge. @default 12 */
    feather?: number;
    /** Ending shape of the iris. @default "circle" */
    shape?: "circle" | "ellipse";
};

export type ClockPatternOptions = {
    /** Centre of the sweep, as a CSS position. @default "50% 50%" */
    center?: string;
    /** Angle the sweep starts from, in degrees (`0` = up). @default 0 */
    from?: number;
    /** Width of the soft leading edge, in degrees. @default 24 */
    feather?: number;
    /** Sweep direction of the hand. @default "clockwise" */
    direction?: "clockwise" | "counterclockwise";
};

export type FanPatternOptions = {
    /** Number of blades sweeping in parallel. @default 4 */
    blades?: number;
    /** Centre of the sweep, as a CSS position. @default "50% 50%" */
    center?: string;
    /** Angle the sweep starts from, in degrees (`0` = up). @default 0 */
    from?: number;
    /** Width of each blade's soft leading edge, in degrees. @default 10 */
    feather?: number;
};

export type BlindsPatternOptions = {
    /** Slat orientation, or any CSS gradient angle in degrees. @default "horizontal" */
    orientation?: BlindsOrientation | number;
    /** Number of slats. @default 8 */
    slats?: number;
    /** Width of each slat's soft edge, in percent of the frame. @default 0 (hard slats) */
    feather?: number;
};

export type DotsPatternOptions = {
    /** Number of tile rows. @default 6 */
    rows?: number;
    /** Number of tile columns. @default 10 */
    cols?: number;
    /** Width of each dot's soft rim, in percent of its tile. @default 20 */
    feather?: number;
    /**
     * Phase offset (0–1) of a second dot grid anchored on the tile corners,
     * giving a staggered, checker-like fill instead of a uniform one.
     * @default 0
     */
    stagger?: number;
};

/** Trim a number to at most three decimals for embedding in a CSS string. */
function fmt(value: number): string {
    return Number.isInteger(value)
        ? String(value)
        : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function clamp(value: number, lo: number, hi: number): number {
    return value < lo ? lo : value > hi ? hi : value;
}

/**
 * The transition-animation vocabulary: static factories building the
 * {@link MaskPattern} geometries that the transition engines animate.
 *
 * Engines are instantiated, patterns are not — a transition reads as
 * "engine(animation)":
 * ```ts
 * new Reveal({duration: 1200, pattern: Mask.clock()})
 * new ThroughColor({duration: 1800, pattern: Mask.clock(), uncover: "continue"})
 * ```
 * {@link Mask.invert} flips a pattern's orientation, and a hand-written
 * `MaskPattern` object works anywhere a built-in one does.
 */
export class Mask {
    private constructor() {
    }

    /** A feathered directional wipe, travelling toward any keyword or angle. */
    static wipe(options: WipePatternOptions = {}): MaskPattern {
        const direction = options.direction ?? "left";
        const f = Math.max(0, options.feather ?? 12);
        const dir = typeof direction === "number" ? `${fmt(direction)}deg` : wipeGradientDir(direction);

        return {
            mask: (t, inverted) => {
                const edge = -f + (inverted ? 1 - clamp01(t) : clamp01(t)) * (100 + f);
                return inverted
                    ? `linear-gradient(${dir}, transparent ${fmt(edge)}%, #000 ${fmt(edge + f)}%)`
                    : `linear-gradient(${dir}, #000 ${fmt(edge)}%, transparent ${fmt(edge + f)}%)`;
            },
        };
    }

    /**
     * Barn doors: two feathered edges closing from opposite edges toward the
     * centre. Inverted, a bar grows outward from the centre line instead.
     */
    static barnDoor(options: BarnDoorPatternOptions = {}): MaskPattern {
        const axis = options.axis ?? "horizontal";
        const f = Math.max(0, options.feather ?? 12);
        const [dir, opposite] = typeof axis === "number"
            ? [`${fmt(axis)}deg`, `${fmt(axis + 180)}deg`]
            : axis === "vertical" ? ["to bottom", "to top"] : ["to right", "to left"];

        return {
            mask: (t, inverted) => {
                // Half-width of the covered region on each side; the feather sweeps
                // fully off both ends so t=0 is clear and t=1 covers the centre seam.
                const e = -f + clamp01(t) * (50 + f);

                if (!inverted) {
                    // Two one-sided wipes; the layers union, so the bands may cross
                    // the centre without the stop-ordering problems of one gradient.
                    const door = (d: string) => `linear-gradient(${d}, #000 ${fmt(e)}%, transparent ${fmt(e + f)}%)`;
                    return `${door(dir)}, ${door(opposite)}`;
                }

                if (e < 0) {
                    // The bar has not fully formed: cap the peak alpha so the centre
                    // line fades in instead of appearing as a hard hairline.
                    const peak = clamp01((e + f) / Math.max(f, 1e-6));
                    return `linear-gradient(${dir}, transparent ${fmt(50 - e - f)}%, rgba(0,0,0,${fmt(peak)}) 50%, transparent ${fmt(50 + e + f)}%)`;
                }
                return `linear-gradient(${dir}, transparent ${fmt(50 - e - f)}%, #000 ${fmt(50 - e)}%, #000 ${fmt(50 + e)}%, transparent ${fmt(50 + e + f)}%)`;
            },
        };
    }

    /**
     * A feathered iris growing from the centre out. Inverted, it covers from
     * the rim inward — the classic "iris to black" closes with
     * `new ThroughColor({pattern: Mask.iris(), inverted: true})`.
     */
    static iris(options: IrisPatternOptions = {}): MaskPattern {
        const center = options.center ?? "50% 50%";
        const f = Math.max(0, options.feather ?? 12);
        const shape = options.shape ?? "circle";

        return {
            mask: (t, inverted) => {
                if (inverted) {
                    const r = (1 - clamp01(t)) * 150;
                    return `radial-gradient(${shape} at ${center}, transparent ${fmt(r - f)}%, #000 ${fmt(r)}%)`;
                }
                const r = clamp01(t) * 150;
                return `radial-gradient(${shape} at ${center}, #000 ${fmt(r - f)}%, transparent ${fmt(r)}%)`;
            },
        };
    }

    /**
     * A clock sweep: one feathered radial edge travelling a full turn around
     * the centre. The trailing edge at the start angle is hard by nature, as
     * in a classic clock wipe; only the leading edge is feathered.
     */
    static clock(options: ClockPatternOptions = {}): MaskPattern {
        const center = options.center ?? "50% 50%";
        const from = options.from ?? 0;
        const f = Math.max(0, options.feather ?? 24);
        const direction = options.direction ?? "clockwise";

        return {
            mask: (t, inverted) => {
                // Inverting a sweep is sweeping the other way from the same anchor.
                const ccw = (direction === "counterclockwise") !== !!inverted;
                const e = -f + clamp01(t) * (360 + f);

                if (ccw) {
                    const a = Math.max(0, 360 - e - f);
                    const b = Math.max(a, 360 - e);
                    return `conic-gradient(from ${fmt(from)}deg at ${center}, transparent ${fmt(a)}deg, #000 ${fmt(b)}deg)`;
                }
                const b = Math.max(0, e);
                return `conic-gradient(from ${fmt(from)}deg at ${center}, #000 ${fmt(b)}deg, transparent ${fmt(Math.max(b, e + f))}deg)`;
            },
        };
    }

    /**
     * A windmill of `blades` clock sweeps running in parallel, each covering
     * its own sector. The feather compresses over the last few degrees of each
     * sector so the blades can meet cleanly.
     */
    static fan(options: FanPatternOptions = {}): MaskPattern {
        const blades = Math.max(1, Math.round(options.blades ?? 4));
        const center = options.center ?? "50% 50%";
        const from = options.from ?? 0;
        const f = Math.max(0, options.feather ?? 10);
        const pitch = 360 / blades;

        return {
            mask: (t, inverted) => {
                const e = -f + (inverted ? 1 - clamp01(t) : clamp01(t)) * (pitch + f);
                const solid = clamp(e, 0, pitch);
                const soft = clamp(e + f, 0, pitch);
                const head = `repeating-conic-gradient(from ${fmt(from)}deg at ${center}`;

                return inverted
                    ? `${head}, transparent 0deg, transparent ${fmt(solid)}deg, #000 ${fmt(soft)}deg, #000 ${fmt(pitch)}deg)`
                    : `${head}, #000 0deg, #000 ${fmt(solid)}deg, transparent ${fmt(soft)}deg, transparent ${fmt(pitch)}deg)`;
            },
        };
    }

    /**
     * Venetian slats widening until they cover the frame. Hard-edged by
     * default; raise `feather` for soft slats, or pass an angle for slanted
     * ones.
     */
    static blinds(options: BlindsPatternOptions = {}): MaskPattern {
        const orientation = options.orientation ?? "horizontal";
        const slats = Math.max(1, options.slats ?? 8);
        const f = Math.max(0, options.feather ?? 0);
        const axis = typeof orientation === "number" ? `${fmt(orientation)}deg` : blindsAxis(orientation);
        const pitch = 100 / slats;

        return {
            mask: (t, inverted) => {
                const e = -f + (inverted ? 1 - clamp01(t) : clamp01(t)) * (pitch + f);
                const solid = clamp(e, 0, pitch);
                const soft = clamp(e + f, 0, pitch);

                return inverted
                    ? `repeating-linear-gradient(${axis}, transparent 0, transparent ${fmt(solid)}%, #000 ${fmt(soft)}%, #000 ${fmt(pitch)}%)`
                    : `repeating-linear-gradient(${axis}, #000 0, #000 ${fmt(solid)}%, transparent ${fmt(soft)}%, transparent ${fmt(pitch)}%)`;
            },
        };
    }

    /**
     * A tiled polka-dot fill: a dot grows inside every cell of a `cols`×`rows`
     * grid until the cells flood together. With `stagger`, a second grid
     * anchored on the cell corners runs behind the first for a denser,
     * checker-like fill. (The staggered variant's inverted form is an
     * approximation: the layers union, so mid-run coverage errs dark.)
     */
    static dots(options: DotsPatternOptions = {}): MaskPattern {
        const rows = Math.max(1, options.rows ?? 6);
        const cols = Math.max(1, options.cols ?? 10);
        const f = Math.max(0, options.feather ?? 20);
        const stagger = clamp01(options.stagger ?? 0);
        // Delay (in t) before the corner grid starts; both grids finish at t=1.
        const d = stagger * 0.5;

        const layer = (at: string, t: number, inverted?: boolean) => {
            const r = -f + clamp01(t) * (100 + f);
            return inverted
                ? `radial-gradient(circle farthest-corner at ${at}, transparent ${fmt(r)}%, #000 ${fmt(r + f)}%)`
                : `radial-gradient(circle farthest-corner at ${at}, #000 ${fmt(r)}%, transparent ${fmt(r + f)}%)`;
        };

        return {
            size: `${fmt(100 / cols)}% ${fmt(100 / rows)}%`,
            repeat: "repeat",
            mask: (t, inverted) => {
                const tt = inverted ? 1 - clamp01(t) : clamp01(t);
                if (d <= 0) {
                    return layer("50% 50%", tt, inverted);
                }
                const first = clamp01(tt / (1 - d));
                const second = clamp01((tt - d) / (1 - d));
                // Inverted, the corner grid leads so the cells that covered first
                // are also the first to clear.
                return inverted
                    ? `${layer("50% 50%", second, true)}, ${layer("0% 0%", first, true)}`
                    : `${layer("50% 50%", first)}, ${layer("0% 0%", second)}`;
            },
        };
    }

    /**
     * Swap a pattern's orientations: the inverted geometry becomes the natural
     * one and vice versa (e.g. an iris that reveals rim-in instead of
     * centre-out).
     */
    static invert(pattern: MaskPattern): MaskPattern {
        return {
            ...pattern,
            mask: (t, inverted) => pattern.mask(t, !inverted),
        };
    }

    /**
     * The full mask style block for a pattern at coverage `t` — the pattern's
     * image plus its tiling, mirrored to the `-webkit-` prefixes. For authors
     * of custom transitions.
     */
    static toStyle(pattern: MaskPattern, t: number, inverted = false): CSSProps {
        return maskStyle(pattern.mask(t, inverted), pattern.size, pattern.repeat);
    }
}
