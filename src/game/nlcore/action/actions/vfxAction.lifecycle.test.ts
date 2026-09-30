import { describe, expect, it, vi } from "vitest";
import { Vfx } from "@core/elements/vfx";
import { VfxAction } from "./vfxAction";
import { ContentNode } from "@core/action/tree/actionTree";
import { VfxActionTypes } from "@core/action/actionTypes";

/**
 * The lifetime of an overlay on the stage: declared, shown, hidden, and still there.
 *
 * These are the three facts that carry the cost model, and none of them is visible from the element
 * API alone (`Vfx` only emits actions) - they live in what this action does to `GameState.state.vfx`.
 */

type ExposedVfx = {
    show: (options?: unknown) => Promise<void>;
    hide: (options?: unknown) => Promise<void>;
    pause: () => void;
    resume: () => void;
    setRate: (rate: number) => void;
};

function createStateLike(exposed: Partial<ExposedVfx> = {}) {
    const vfxOnStage: Vfx[] = [];
    const warnings: string[] = [];
    const exposedState: ExposedVfx = {
        show: async () => void 0,
        hide: async () => void 0,
        pause: () => void 0,
        resume: () => void 0,
        setRate: () => void 0,
        ...exposed,
    };
    const state = {
        state: {vfx: vfxOnStage},
        addVfx: (vfx: Vfx) => void vfxOnStage.push(vfx),
        removeVfx: (vfx: Vfx) => {
            const index = vfxOnStage.indexOf(vfx);
            if (index >= 0) vfxOnStage.splice(index, 1);
        },
        isVfxAdded: (vfx: Vfx) => vfxOnStage.includes(vfx),
        stage: {update: vi.fn()},
        actionHistory: {push: vi.fn()},
        logger: {
            debug: vi.fn(),
            weakWarn: (...args: unknown[]) => void warnings.push(args.map(String).join(" ")),
        },
        getExposedStateAsync: (_element: unknown, handler: (state: ExposedVfx) => void | Promise<void>) => {
            void Promise.resolve(handler(exposedState));
            return {cancel: () => void 0};
        },
    };
    return {state, vfxOnStage, warnings, exposedState};
}

function run(vfx: Vfx, type: Values, content: unknown[], stateLike: ReturnType<typeof createStateLike>) {
    const action = new VfxAction(
        {getSelf: () => vfx} as never,
        type as never,
        new ContentNode().setContent(content) as never,
    );
    return action.executeAction(stateLike.state as never, {stackModel: {}} as never);
}

type Values = (typeof VfxActionTypes)[keyof typeof VfxActionTypes];

/** Lets the handler passed to `getExposedStateAsync` run before the assertions. */
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe("vfx:preload", () => {
    it("puts the overlay on the stage without showing it", () => {
        // The whole point: the element exists (and so is fetching and decoding) while nothing about
        // the picture has changed. `display` stays false, which is what keeps it at zero opacity.
        const vfx = new Vfx({src: "/fx/rain.webm"});
        const stateLike = createStateLike();

        run(vfx, VfxActionTypes.preload, [], stateLike);

        expect(stateLike.vfxOnStage).toEqual([vfx]);
        expect(vfx.state.display).toBe(false);
        expect(stateLike.state.stage.update).toHaveBeenCalled();
    });

    it("is idempotent", () => {
        const vfx = new Vfx({src: "/fx/rain.webm"});
        const stateLike = createStateLike();

        run(vfx, VfxActionTypes.preload, [], stateLike);
        run(vfx, VfxActionTypes.preload, [], stateLike);

        expect(stateLike.vfxOnStage).toEqual([vfx]);
    });
});

describe("vfx:show", () => {
    it("does not add a second copy of an overlay that was preloaded", async () => {
        const vfx = new Vfx({src: "/fx/rain.webm"});
        const stateLike = createStateLike();

        run(vfx, VfxActionTypes.preload, [], stateLike);
        run(vfx, VfxActionTypes.show, [undefined], stateLike);
        await settle();

        expect(stateLike.vfxOnStage).toEqual([vfx]);
        expect(vfx.state.display).toBe(true);
    });

    it("puts an overlay on stage that nothing preloaded", async () => {
        const vfx = new Vfx({src: "/fx/rain.webm"});
        const stateLike = createStateLike();

        run(vfx, VfxActionTypes.show, [undefined], stateLike);
        await settle();

        expect(stateLike.vfxOnStage).toEqual([vfx]);
        expect(vfx.state.display).toBe(true);
    });
});

describe("vfx:hide", () => {
    it("keeps the overlay on the stage, invisible", async () => {
        // Removing it would throw away a decoder holding a clip the story is likely to want again,
        // and a paused video costs no frame time - so hiding stops the work and keeps the warmth.
        const vfx = new Vfx({src: "/fx/rain.webm"});
        const stateLike = createStateLike();

        run(vfx, VfxActionTypes.show, [undefined], stateLike);
        await settle();
        run(vfx, VfxActionTypes.hide, [undefined], stateLike);
        await settle();

        expect(stateLike.vfxOnStage).toEqual([vfx]);
        expect(vfx.state.display).toBe(false);
    });

    it("is a no-op on an overlay that is on stage but not shown", async () => {
        // A preloaded overlay is on stage and invisible, so `isVfxAdded` alone would let this fade
        // zero to zero and spend the duration doing it.
        const vfx = new Vfx({src: "/fx/rain.webm"});
        const hide = vi.fn(async () => void 0);
        const stateLike = createStateLike({hide});

        run(vfx, VfxActionTypes.preload, [], stateLike);
        run(vfx, VfxActionTypes.hide, [undefined], stateLike);
        await settle();

        expect(hide).not.toHaveBeenCalled();
        expect(stateLike.warnings.some(message => /not shown/.test(message))).toBe(true);
    });
});
