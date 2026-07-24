import { describe, expect, it } from "vitest";
// Import through the public barrel (as consumers do) so the module graph initialises in the same
// order the library ships with (see camera.test.ts for the background on this).
import { Vfx } from "@core/common/core";
import { Chained } from "@core/action/chain";
import { VfxActionContentType, VfxActionTypes } from "@core/action/actionTypes";
import { RuntimeScriptError } from "@core/common/Utils";
import type { Values } from "@lib/util/data";

function typesOf(actionLike: unknown): string[] {
    return Chained.toActions([actionLike as never]).map((a) => a.type);
}

describe("Vfx element", () => {
    describe("construction / config", () => {
        it("throws a RuntimeScriptError when src is missing", () => {
            expect(() => new Vfx({} as never)).toThrow(RuntimeScriptError);
            expect(() => new Vfx({} as never)).toThrow(/src/);
        });

        it("throws when src is an empty string", () => {
            expect(() => new Vfx({ src: "" })).toThrow(/src/);
        });

        it("applies the documented defaults", () => {
            const vfx = new Vfx({ src: "/fx/petals.webm" });
            expect(vfx.config).toEqual({
                src: "/fx/petals.webm",
                blendMode: "normal",
                loop: true,
                muted: true,
                opacity: 1,
                playbackRate: 1,
                fit: "cover",
                zIndex: 0,
            });
        });

        it("merges explicit config over the defaults", () => {
            const vfx = new Vfx({
                src: "/fx/dust.webm",
                blendMode: "screen",
                loop: false,
                muted: false,
                opacity: 0.9,
                playbackRate: 0.5,
                fit: "contain",
                zIndex: 3,
            });
            expect(vfx.config.blendMode).toBe("screen");
            expect(vfx.config.loop).toBe(false);
            expect(vfx.config.muted).toBe(false);
            expect(vfx.config.opacity).toBe(0.9);
            expect(vfx.config.playbackRate).toBe(0.5);
            expect(vfx.config.fit).toBe("contain");
            expect(vfx.config.zIndex).toBe(3);
        });

        it("starts hidden and not paused", () => {
            const vfx = new Vfx({ src: "/fx/petals.webm" });
            expect(vfx.state).toEqual({ display: false, paused: false });
        });
    });

    describe("chainable actions", () => {
        it("show() emits a single vfx:show action carrying the fade options", () => {
            const vfx = new Vfx({ src: "/fx/petals.webm" });
            const actions = Chained.toActions([vfx.show({ duration: 800, easing: "easeIn" })]);
            expect(actions.map((a) => a.type)).toEqual([VfxActionTypes.show]);
            expect(actions[0].contentNode.getContent()).toEqual([{ duration: 800, easing: "easeIn" }]);
        });

        it("show() without options emits vfx:show with no options payload", () => {
            const vfx = new Vfx({ src: "/fx/petals.webm" });
            const actions = Chained.toActions([vfx.show()]);
            expect(actions.map((a) => a.type)).toEqual([VfxActionTypes.show]);
            expect(actions[0].contentNode.getContent()[0]).toBeUndefined();
        });

        it("hide() emits a single vfx:hide action carrying the fade options", () => {
            const vfx = new Vfx({ src: "/fx/petals.webm" });
            const actions = Chained.toActions([vfx.hide({ duration: 1200 })]);
            expect(actions.map((a) => a.type)).toEqual([VfxActionTypes.hide]);
            expect(actions[0].contentNode.getContent()).toEqual([{ duration: 1200 }]);
        });

        it("pause() emits a single vfx:pause action", () => {
            const vfx = new Vfx({ src: "/fx/petals.webm" });
            expect(typesOf(vfx.pause())).toEqual([VfxActionTypes.pause]);
        });

        it("resume() emits a single vfx:resume action", () => {
            const vfx = new Vfx({ src: "/fx/petals.webm" });
            expect(typesOf(vfx.resume())).toEqual([VfxActionTypes.resume]);
        });

        it("setPlaybackRate(rate) emits a single vfx:setRate action carrying the rate", () => {
            const vfx = new Vfx({ src: "/fx/petals.webm" });
            const actions = Chained.toActions([vfx.setPlaybackRate(0.5)]);
            expect(actions.map((a) => a.type)).toEqual([VfxActionTypes.setRate]);
            expect(actions[0].contentNode.getContent()).toEqual([0.5]);
        });
    });

    describe("action content types", () => {
        it("VfxActionContentType keys cover exactly the VfxActionTypes values", () => {
            type TypeValues = Values<typeof VfxActionTypes>;
            // Compile-time: every action type value has a content entry...
            const coverage: Record<TypeValues, unknown> = null as unknown as VfxActionContentType;
            // ...and every content entry corresponds to an action type value.
            const exact: TypeValues = null as unknown as keyof VfxActionContentType;
            void coverage;
            void exact;

            // Runtime: the action type table holds the five specified operations plus the
            // "vfx:action" marker every element's table carries (required by the Action base
            // class's static side).
            expect(Object.values(VfxActionTypes).sort()).toEqual([
                "vfx:action",
                "vfx:hide",
                "vfx:pause",
                "vfx:resume",
                "vfx:setRate",
                "vfx:show",
            ]);
        });
    });

    describe("serialization", () => {
        it("round-trips display/paused state through toData/fromData", () => {
            const vfx = new Vfx({ src: "/fx/petals.webm" });
            vfx.state.display = true;
            vfx.state.paused = true;

            const raw = vfx.toData();
            expect(raw).toEqual({ state: { display: true, paused: true } });

            const restored = new Vfx({ src: "/fx/petals.webm" });
            restored.fromData(raw as never);
            expect(restored.state).toEqual({ display: true, paused: true });
        });

        it("reset() restores the initial state", () => {
            const vfx = new Vfx({ src: "/fx/petals.webm" });
            vfx.state.display = true;
            vfx.state.paused = true;
            vfx.reset();
            expect(vfx.state).toEqual({ display: false, paused: false });
        });
    });
});
