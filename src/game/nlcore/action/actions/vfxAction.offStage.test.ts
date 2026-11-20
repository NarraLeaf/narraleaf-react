import { describe, expect, it, vi } from "vitest";
import { Vfx } from "@core/elements/vfx";
import { VfxAction } from "./vfxAction";
import { ContentNode } from "@core/action/tree/actionTree";
import { VfxActionTypes } from "@core/action/actionTypes";
import type { Awaitable } from "@lib/util/data";

/**
 * Pause, resume and a rate change aimed at an overlay that is no longer on the stage.
 *
 * An overlay leaves the stage with the scene that started it, so a handle kept in script and used
 * after that scene is gone finds nothing to talk to. It used to throw and stop the story; it does
 * nothing now and says so - what `hide` on an overlay that is not shown has always done - while an
 * overlay that is on the stage is driven exactly as it always was.
 */

type Transport = "pause" | "resume" | "setRate";

const TRANSPORT: [Transport, (typeof VfxActionTypes)[keyof typeof VfxActionTypes], unknown[]][] = [
    ["pause", VfxActionTypes.pause, []],
    ["resume", VfxActionTypes.resume, []],
    ["setRate", VfxActionTypes.setRate, [0.5]],
];

function createStateLike(onStage: Vfx[]) {
    const warnings: string[] = [];
    const exposed = {
        pause: vi.fn(),
        resume: vi.fn(),
        setRate: vi.fn(),
    };
    const state = {
        isVfxAdded: (vfx: Vfx) => onStage.includes(vfx),
        logger: {
            debug: vi.fn(),
            weakWarn: (...args: unknown[]) => void warnings.push(args.map(String).join(" ")),
        },
        getExposedStateAsync: (_element: unknown, handler: (state: typeof exposed) => void | Promise<void>) => {
            let cancelled = false;
            setTimeout(() => {
                if (!cancelled) void handler(exposed);
            }, 0);
            return {cancel: () => void (cancelled = true)};
        },
    };
    return {state, warnings, exposed};
}

function run(vfx: Vfx, type: (typeof VfxActionTypes)[keyof typeof VfxActionTypes], content: unknown[], state: unknown) {
    const action = new VfxAction(
        {getSelf: () => vfx} as never,
        type as never,
        new ContentNode().setContent(content) as never,
    );
    return () => action.executeAction(state as never, {stackModel: {}} as never) as Awaitable<unknown>;
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe.each(TRANSPORT)("vfx:%s", (name, type, content) => {
    it("on an overlay that is not on the stage, does nothing, says so, and lets the story carry on", async () => {
        const vfx = new Vfx({src: "/fx/gone.webm"});
        const {state, warnings, exposed} = createStateLike([]);

        let result: Awaitable<unknown> | undefined;
        expect(() => (result = run(vfx, type, content, state)())).not.toThrow();
        expect(result!.isSettled()).toBe(true);
        await tick();
        expect(exposed[name]).not.toHaveBeenCalled();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("not on the stage");
        expect(warnings[0]).toContain("/fx/gone.webm");
    });

    it("on an overlay that is on the stage, drives it exactly as before", async () => {
        const vfx = new Vfx({src: "/fx/here.webm"});
        const {state, warnings, exposed} = createStateLike([vfx]);

        const result = run(vfx, type, content, state)();
        await tick();
        await tick();
        expect(exposed[name]).toHaveBeenCalledTimes(1);
        if (name === "setRate") {
            expect(exposed.setRate).toHaveBeenCalledWith(0.5);
        }
        expect(result.isSettled()).toBe(true);
        expect(warnings).toEqual([]);
    });
});
