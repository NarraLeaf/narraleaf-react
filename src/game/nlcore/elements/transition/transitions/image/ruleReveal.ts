import {
    AnimationController,
    AnimationTaskMapArray,
    CSSProps,
    TransitionAnimationType,
    TransitionTask,
} from "@core/elements/transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import {ImageSrc} from "@core/types";
import {Utils} from "@core/common/Utils";

type AnimationType = [TransitionAnimationType.Number];

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

/** Widest soft edge that still reads as an edge, and the narrowest that is still finite. */
const MIN_FEATHER = 0.002;
const MAX_FEATHER = 1;
const DEFAULT_FEATHER = 0.12;

let filterSeq = 0;

export type RuleRevealOptions = {
    /** Duration in milliseconds. */
    duration: number;
    /**
     * The rule image: a greyscale picture whose brightness at each point says *when* that point
     * changes over. Dark changes first, bright last, so a rule painted as a spiral wipes as a
     * spiral. Stretched to the frame, so paint it at the stage's aspect ratio.
     */
    rule: ImageSrc;
    /**
     * Width of the soft edge, as a fraction of the rule's brightness range. `0.12` puts roughly an
     * eighth of the rule's tonal range in transition at any moment; smaller is a crisper edge.
     * @default 0.12
     */
    feather?: number;
    /** Change the bright areas over first instead of the dark ones. @default false */
    inverted?: boolean;
    easing?: TransformDefinitions.EasingDefinition;
};

/**
 * The **rule-image** engine: the target is revealed over the previous frame in the order a
 * greyscale picture dictates, rather than through a geometric pattern.
 *
 * This is the transition form commercial visual novels are authored against — a pack of rule
 * images (spirals, shatters, brush strokes, drifting cloud fronts) and one engine that plays any of
 * them. {@link Reveal} covers the geometric half of the same job with {@link Mask} patterns, which
 * are CSS gradients and therefore limited to shapes that can be *described*; a rule image is
 * per-pixel data and can be any shape at all, which is why it is its own engine rather than another
 * `MaskPattern`.
 *
 * ```ts
 * scene.jumpTo(next, new RuleReveal({duration: 1200, rule: "/rules/spiral.png"}))
 * ```
 *
 * ### How it works, and the one thing worth knowing
 *
 * At progress `t` a point changes over once the sweep has passed its brightness:
 *
 * ```text
 * alpha = clamp01((T - luminance) / feather),  T sweeping 0 .. 1 + feather
 * ```
 *
 * That is computed by an SVG filter — `feImage` reads the rule, `feColorMatrix` turns its
 * brightness into coverage, and one `feComposite` does the comparison — so the whole sweep is one
 * GPU pass over the frame and costs the same as no filter at all in practice.
 *
 * The filter runs in **sRGB**, deliberately: filters default to linearRGB, under which a rule's
 * mid-grey would land at 0.21 rather than half way, and every rule in a pack would play with its
 * timing bent. Nothing about that failure looks like an error, so it is pinned here rather than
 * left to a default.
 */
export class RuleReveal extends ImageTransition<AnimationType> {
    private duration: number;
    private rule: string;
    private feather: number;
    private inverted: boolean;
    private easing?: TransformDefinitions.EasingDefinition;

    /**@package */
    private filterId: string | null = null;
    /**@package */
    private host: SVGSVGElement | null = null;
    /**@package */
    private cut: SVGElement | null = null;

    constructor(options: RuleRevealOptions) {
        super();
        this.duration = options.duration;
        this.rule = Utils.srcToURL(options.rule);
        this.feather = Math.min(MAX_FEATHER, Math.max(MIN_FEATHER, options.feather ?? DEFAULT_FEATHER));
        this.inverted = options.inverted ?? false;
        this.easing = options.easing;
    }

    createTask(): TransitionTask<HTMLImageElement, AnimationType> {
        return {
            animations: [{
                type: TransitionAnimationType.Number,
                start: 0,
                end: 1,
                duration: this.duration,
                ease: this.easing,
            }],
            resolve: [
                this.asPrev<AnimationType>(() => ({})),
                this.asTarget<AnimationType>((progress: number) => ({
                    style: this.styleAt(progress),
                })),
            ],
        };
    }

    /**
     * Tear the scaffold down when the run ends, however it ends.
     *
     * Both drivers call this, and the controller they get back outlives the React element — a
     * transition whose element unmounts mid-run still completes its value animation — so this is
     * the one place that sees every ending. {@link styleAt} also drops it on the settled frame, so
     * the normal path never waits for this.
     * @package
     */
    override requestAnimations(tasks: AnimationTaskMapArray<AnimationType>): AnimationController<AnimationType> {
        const controller = super.requestAnimations(tasks);
        controller.onComplete(() => this.dispose());
        controller.onCanceled(() => this.dispose());
        return controller;
    }

    copy(): RuleReveal {
        return new RuleReveal({
            duration: this.duration,
            rule: this.rule,
            feather: this.feather,
            inverted: this.inverted,
            easing: this.easing,
        });
    }

    /**
     * The style for one frame — and the side of this class that has to stay honest about the DOM.
     *
     * The settled frame carries no filter at all rather than a filter wound to its end: a filter
     * left on a scene root keeps that subtree rasterised as one layer, and the settled pose resets
     * `filter` on the assumption that a finished transition owns nothing.
     * @package
     */
    private styleAt(progress: number): CSSProps {
        if (progress >= 1) {
            this.dispose();
            return {filter: ""};
        }
        const filterId = this.ensureScaffold();
        if (!filterId) {
            // No document: server rendering, or a unit test inspecting which properties a
            // transition writes. Naming the property is what those callers read.
            return {filter: ""};
        }
        // T sweeps past both ends of the brightness range so the first and last frames are total:
        // at t = 0 nothing has changed over even where the rule is pure black, and at t = 1
        // everything has, including pure white.
        const T = progress * (1 + this.feather);
        const k3 = (this.inverted ? 1 : -1) / this.feather;
        const k4 = (this.inverted ? T - 1 : T) / this.feather;
        this.cut?.setAttribute("k3", String(k3));
        this.cut?.setAttribute("k4", String(k4));
        return {filter: `url(#${filterId})`};
    }

    /**
     * Build the filter once, on first use, and hand back the id to point `filter` at.
     *
     * Not built in `createTask`: that method is documented as free of side effects, and it is
     * called by callers that only want to read what a transition would write.
     * @package
     */
    private ensureScaffold(): string | null {
        if (typeof document === "undefined") {
            return null;
        }
        if (this.filterId && this.host) {
            return this.filterId;
        }
        const id = `nl-rule-${++filterSeq}`;
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("data-element-type", "rule-transition");
        svg.setAttribute("width", "0");
        svg.setAttribute("height", "0");
        Object.assign(svg.style, {position: "absolute", width: "0", height: "0", overflow: "hidden"});

        const filter = document.createElementNS(SVG_NS, "filter");
        filter.setAttribute("id", id);
        // Both of these are load-bearing and neither is the default. sRGB keeps the rule's own
        // greys meaning what they look like; object-bounding-box units are what let one rule serve
        // any element size, since the primitives below are then written in fractions of the frame.
        filter.setAttribute("color-interpolation-filters", "sRGB");
        filter.setAttribute("primitiveUnits", "objectBoundingBox");
        filter.setAttribute("x", "0");
        filter.setAttribute("y", "0");
        filter.setAttribute("width", "100%");
        filter.setAttribute("height", "100%");

        const image = document.createElementNS(SVG_NS, "feImage");
        image.setAttribute("href", this.rule);
        // Some engines still read only the namespaced form; writing both costs one attribute.
        image.setAttributeNS(XLINK_NS, "xlink:href", this.rule);
        image.setAttribute("preserveAspectRatio", "none");
        image.setAttribute("x", "0");
        image.setAttribute("y", "0");
        image.setAttribute("width", "1");
        image.setAttribute("height", "1");
        image.setAttribute("result", "rule");

        const luminance = document.createElementNS(SVG_NS, "feColorMatrix");
        luminance.setAttribute("in", "rule");
        luminance.setAttribute("type", "luminanceToAlpha");
        luminance.setAttribute("result", "lum");

        // `arithmetic` is k1·i1·i2 + k2·i1 + k3·i2 + k4, and the spec clamps the result to 0..1 —
        // which is the clamp the sweep needs, for free. Only k4 moves per frame.
        const cut = document.createElementNS(SVG_NS, "feComposite");
        cut.setAttribute("in", "lum");
        cut.setAttribute("in2", "lum");
        cut.setAttribute("operator", "arithmetic");
        cut.setAttribute("k1", "0");
        cut.setAttribute("k2", "0");
        cut.setAttribute("k3", "0");
        cut.setAttribute("k4", "0");
        cut.setAttribute("result", "cut");

        const apply = document.createElementNS(SVG_NS, "feComposite");
        apply.setAttribute("in", "SourceGraphic");
        apply.setAttribute("in2", "cut");
        apply.setAttribute("operator", "in");

        filter.append(image, luminance, cut, apply);
        svg.appendChild(filter);
        document.body.appendChild(svg);

        this.filterId = id;
        this.host = svg;
        this.cut = cut;
        return id;
    }

    /**@package */
    private dispose(): void {
        this.host?.remove();
        this.host = null;
        this.cut = null;
        this.filterId = null;
    }
}
