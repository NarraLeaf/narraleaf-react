import type {Scene} from "@core/elements/scene";
import type {Transition} from "@core/elements/transition/transition";
import type {ImageTransition} from "@core/elements/transition/transitions/image/imageTransition";
import type {
    AnimationController,
    AnimationDataTypeArray,
    CSSProps,
    ElementProp,
    TransitionAnimationType,
    TransitionTask,
} from "@core/elements/transition/type";
import {Awaitable, deepMerge, SkipController} from "@lib/util/data";
import {assignElementProps} from "@player/lib/elementProps";
import type {GameState} from "@player/gameState";
import {Timeline} from "@player/Tasks";

/**
 * Which scene each half of a stage transition drives.
 *
 * A transition task's resolvers are already split by {@link Transition.asPrev} / {@link
 * Transition.asTarget}; this is what those two roles mean at the stage level.
 */
export type StageTransitionRoles = {
    /** The scene being left. Driven by the `asPrev` resolvers. */
    from: Scene;
    /** The scene being entered. Driven by the `asTarget` resolvers. */
    to: Scene;
};

/** How long the start of a transition may wait on the incoming scene's images. */
const LOAD_GATE_TIMEOUT = 4000;

/* Written under every frame of a scene's half. The scene root already carries its own position
   and size (a full-bleed absolute box from its class list), so the base contributes nothing but
   a compositing hint and a stacking order — anything more would fight the layout the scene owns.

   The incoming scene has to sit *above* the outgoing one, and DOM order puts it below: a new
   scene is unshifted to the front of the list, so it renders first and paints first. Every
   transition assumes the other order — a `Reveal` masks the incoming half to uncover it, which
   uncovers nothing while the outgoing scene still covers it, and a `Dissolve` whose incoming half
   is underneath composites its opacity twice and dips through the page background at the midpoint.
   This is also the order `Image.tsx` gives an image's own two halves. */
const SCENE_BASE_STYLE: CSSProps = {
    willChange: "opacity, filter, transform",
    zIndex: 0,
};
const INCOMING_SCENE_BASE_STYLE: CSSProps = {
    ...SCENE_BASE_STYLE,
    zIndex: 1,
};

/* Written under every frame of an overlay element — the node a keyless resolver drives (today
   only `ThroughColor`'s colour plate). Unlike a scene root, this node is created by the driver
   and owns no layout of its own, so the base has to place it. `pointerEvents: none` because it
   sits above the stage for the length of the transition and must not eat clicks. */
const OVERLAY_BASE_STYLE: CSSProps = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    // Above both halves — a colour plate that the incoming scene paints over is not a colour
    // plate. The host it lives in has no z-index of its own, so this competes with the scenes.
    zIndex: 2,
};

/**
 * What a scene root paints when no transition owns it.
 *
 * This must name **every** property any transition writes to a scene half. A property left out
 * is not neutral — it keeps whatever the last frame put there. That is survivable for the
 * outgoing scene (it is unmounted moments later) but not for the incoming one, which lives on:
 * a `Reveal` leaves a fully-opaque `mask-image` behind, and the scene would then carry that mask
 * for the rest of its life. Cancellation is worse still — it stops mid-flight with no final
 * frame, so a half-way value would stick forever on both halves.
 *
 * `stageSettledStyle.test.ts` pins this list against what the built-in transitions actually
 * write, so a transition cannot start writing a property without this naming it.
 */
export function stageSettledStyle(): CSSProps {
    return {
        willChange: "auto",
        zIndex: "auto",
        opacity: 1,
        transform: "none",
        translate: "none",
        filter: "none",
        clipPath: "none",
        maskImage: "none",
        WebkitMaskImage: "none",
        maskSize: "auto",
        WebkitMaskSize: "auto",
        maskRepeat: "repeat",
        WebkitMaskRepeat: "repeat",
    };
}

/** Where a resolver's output goes: a scene root looked up by id, or an overlay node we own. */
type StageTarget =
    | {kind: "scene"; sceneId: string; role: "current" | "target"}
    | {kind: "overlay"; element: HTMLElement};

type RunningStageTransition = {
    task: TransitionTask<HTMLElement, TransitionAnimationType[]>;
    controller: AnimationController<TransitionAnimationType[]>;
    roles: StageTransitionRoles;
    /** Index-aligned with `task.resolve`. */
    targets: StageTarget[];
    overlays: HTMLElement[];
    cancelLoadGate: VoidFunction;
    stale: boolean;
};

/**
 * Runs a transition across two whole scenes instead of across one image's two sources.
 *
 * The outgoing and incoming scenes are both mounted for the length of a jump (the incoming one
 * is added by `scene:init`, the outgoing one is not removed until `scene:exit`), so the two
 * halves of a transition already exist on screen as sibling subtrees. This driver simply points
 * the task's resolvers at those two roots and writes each frame onto them.
 *
 * It deliberately does **not** go through `useDisplayable`. That hook allocates one fresh element
 * per resolver and reuses React keys to decide which of them survives — the right model when the
 * host owns its content (an image's two sources), and the wrong one here: moving a live scene
 * subtree into a newly allocated wrapper reparents it, which React can only do by unmounting and
 * remounting it. Everything the hook and this driver genuinely share — the animation engine
 * ({@link Transition.requestAnimations}), the prop writer ({@link assignElementProps}), the
 * {@link Timeline}/{@link SkipController} wiring — is shared; what is not shared is the part that
 * has to differ.
 * @internal
 */
export class StageTransitionManager {
    private readonly sceneElements: Map<string, HTMLElement> = new Map();
    private overlayHost: HTMLElement | null = null;
    private running: RunningStageTransition | null = null;

    constructor(private readonly gameState: GameState) {
    }

    /**
     * Bind a scene's root node, or unbind it with `null`.
     *
     * Bound for the scene's whole mounted life, not for the length of a transition — a stage
     * transition never reparents a scene, it only writes to a root that is already there.
     */
    public registerScene(scene: Scene, element: HTMLElement | null): void {
        if (element) {
            this.sceneElements.set(scene.getId(), element);
        } else {
            this.sceneElements.delete(scene.getId());
        }
    }

    /** Bind the (empty, always-present) node overlay elements are created inside. */
    public registerOverlayHost(element: HTMLElement | null): void {
        this.overlayHost = element;
    }

    /** Settle any transition still running — used when the player is torn down or reset. */
    public reset(): void {
        this.running?.controller.complete();
        this.running = null;
    }

    /** Fast-forward a running transition to its end. Wired to the player's skip event. */
    public skip(): void {
        if (!this.running) {
            return;
        }
        this.gameState.logger.debug("StageTransition", "Transition skipped");
        this.running.controller.complete();
    }

    /**
     * Play `transition` between two scenes, resolving once it settles.
     *
     * Returns a {@link Timeline} so the calling action can attach it as a child and abort it on
     * undo, matching how a displayable's transition is tracked.
     */
    public apply(transition: Transition, roles: StageTransitionRoles, resolve: VoidFunction): Timeline {
        // An interrupting transition settles the running one first, the same way `useDisplayable`
        // does: two runs writing to the same scene roots would fight frame by frame.
        this.running?.controller.complete();

        // The built-in catalog is typed for images and injects a src into every keyed resolver.
        // Detached, it contributes style only — which is all a scene root can use.
        //
        // Duck-typed rather than an `instanceof`: importing `ImageTransition` for its value would
        // put this module at the head of the `imageTransition → image → imageAction → darkness`
        // import cycle, and whichever module enters that cycle first sees `ImageTransition`
        // undefined at class-extends time.
        const detachable = transition as Partial<ImageTransition>;
        if (typeof detachable._setDetached === "function") {
            detachable._setDetached(true);
        }

        const task = transition.createTask(this.gameState) as TransitionTask<HTMLElement, TransitionAnimationType[]>;
        const controller = transition.requestAnimations(task.animations);
        const awaitable = new Awaitable<void>().registerSkipController(new SkipController(controller.cancel));
        const timeline = new Timeline(awaitable);
        const overlays: HTMLElement[] = [];
        const targets: StageTarget[] = task.resolve.map((solution) => {
            if (typeof solution === "function") {
                const element = this.createOverlay();
                overlays.push(element);
                return {kind: "overlay", element} satisfies StageTarget;
            }
            const scene = solution.key === "target" ? roles.to : roles.from;
            return {kind: "scene", sceneId: scene.getId(), role: solution.key} satisfies StageTarget;
        });

        const running: RunningStageTransition = {
            task,
            controller,
            roles,
            targets,
            overlays,
            cancelLoadGate: () => void 0,
            stale: false,
        };
        this.running = running;

        controller.onUpdate((values) => this.applyFrame(running, values));
        controller.onComplete(() => {
            // Only the incoming scene is reset. The outgoing one is unmounted by `scene:exit`
            // moments later, and resetting it here would repaint it at full opacity for the
            // frames in between — a flash of the scene we just transitioned away from.
            this.settle(running, [roles.to]);
            resolve();
            awaitable.resolve();
        });
        controller.onCanceled(() => {
            // No final frame was painted, so both halves keep a mid-animation pose unless they
            // are reset. The outgoing scene stays mounted after a cancel (the jump is being
            // undone), so it needs the reset just as much as the incoming one.
            this.settle(running, [roles.from, roles.to]);
            timeline.abort();
        });

        // Paint the start pose before the animation is allowed to run, so the incoming scene is
        // already hidden (or masked, or offset) on the first frame the browser composites — the
        // scenes are siblings and the incoming one is otherwise sitting there fully painted.
        this.applyFrame(running, task.animations.map((animation) => animation.start) as AnimationDataTypeArray<TransitionAnimationType[]>);

        // Gate the start on the incoming scene's images, mirroring the per-element load gate in
        // `useDisplayable`. A scene root is not a `LoadableElement` and never will be — what has
        // to be ready is a whole subtree of images, so the gate aggregates them here instead.
        const gate = this.waitForSceneReady(roles.to);
        running.cancelLoadGate = gate.cancel;
        void gate.promise.then(() => {
            if (!running.stale) {
                controller.start();
            }
        });

        return timeline;
    }

    private applyFrame(
        running: RunningStageTransition,
        values: AnimationDataTypeArray<TransitionAnimationType[]>,
    ): void {
        running.task.resolve.forEach((solution, index) => {
            const target = running.targets[index];
            const element = target.kind === "overlay"
                ? target.element
                : this.sceneElements.get(target.sceneId) ?? null;
            if (!element) {
                // A scene root can legitimately go away mid-flight — an undo unmounts the
                // incoming scene while its transition is still settling. Skipping is correct:
                // there is nothing left to paint, and the run is about to be cancelled anyway.
                return;
            }

            const resolver = typeof solution === "function" ? solution : solution.resolver;
            const base = target.kind === "overlay"
                ? OVERLAY_BASE_STYLE
                : target.role === "target" ? INCOMING_SCENE_BASE_STYLE : SCENE_BASE_STYLE;
            const props = deepMerge<ElementProp<HTMLElement>>({style: base}, resolver(...values));

            assignElementProps(element, props, dropImageAttributes);
        });
    }

    private settle(running: RunningStageTransition, reset: Scene[]): void {
        running.stale = true;
        running.cancelLoadGate();
        running.overlays.forEach((element) => element.remove());
        running.overlays.length = 0;

        reset.forEach((scene) => {
            const element = this.sceneElements.get(scene.getId());
            if (element) {
                Object.assign(element.style, stageSettledStyle());
            }
        });

        if (this.running === running) {
            this.running = null;
        }
    }

    private createOverlay(): HTMLElement {
        const element = document.createElement("div");
        element.setAttribute("data-element-type", "stage-transition-overlay");
        Object.assign(element.style, OVERLAY_BASE_STYLE);
        this.overlayHost?.appendChild(element);

        return element;
    }

    private waitForSceneReady(scene: Scene): {promise: Promise<void>; cancel: VoidFunction} {
        const element = this.sceneElements.get(scene.getId());
        if (!element) {
            return {promise: Promise.resolve(), cancel: () => void 0};
        }

        let cancelTimeout: VoidFunction = () => void 0;
        const timeout = new Promise<void>((resolve) => {
            cancelTimeout = this.gameState.schedule(() => {
                this.gameState.logger.weakWarn("StageTransition", "Timed out waiting for the incoming scene to load");
                resolve();
            }, LOAD_GATE_TIMEOUT);
        });
        const images = Promise.all(
            Array.from(element.querySelectorAll("img")).map(waitForImage)
        ).then(() => void 0);

        return {
            promise: Promise.race([images, timeout]),
            cancel: () => cancelTimeout(),
        };
    }
}

/**
 * Resolver output is typed for images: `ThroughColor` hands its colour plate a placeholder `src`,
 * and `Darkness` collapses its outgoing half with `width`/`height` of 0. None of those attributes
 * mean anything on a `div`, so they are dropped rather than written.
 */
const IMAGE_ONLY_ATTRIBUTES = ["src", "width", "height"] as const;

function dropImageAttributes(props: ElementProp<HTMLElement>): ElementProp<HTMLElement> {
    if (!IMAGE_ONLY_ATTRIBUTES.some(attribute => attribute in props)) {
        return props;
    }

    const rest = {...props} as Record<string, unknown>;
    IMAGE_ONLY_ATTRIBUTES.forEach(attribute => delete rest[attribute]);

    return rest as ElementProp<HTMLElement>;
}

/** Resolve once an image is painted, or immediately if it can never be. */
function waitForImage(image: HTMLImageElement): Promise<void> {
    // An image the scene has not given a source to yet cannot be waited on — and must not be,
    // or the gate would hang until its timeout on every scene with an unused image slot.
    if (!image.getAttribute("src")) {
        return Promise.resolve();
    }
    // `decode()` covers loading *and* decoding; resolving on `load` alone reveals a frame the
    // browser has not rasterised yet. A broken url rejects, and must not wedge the gate.
    if (typeof image.decode === "function") {
        return image.decode().then(() => void 0, () => void 0);
    }
    if (image.complete) {
        return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
        const done = (): void => {
            image.removeEventListener("load", done);
            image.removeEventListener("error", done);
            resolve();
        };
        image.addEventListener("load", done);
        image.addEventListener("error", done);
    });
}
