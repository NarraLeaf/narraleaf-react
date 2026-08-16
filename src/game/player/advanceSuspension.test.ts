import { describe, expect, it } from "vitest";
import { GameState } from "@player/gameState";

/**
 * Holding a line while something is drawn over it.
 *
 * A popup opened from an inline word has to stop the line advancing underneath it, and the three
 * ways a line advances - a click on the stage, the advance key, the skip key - are read in three
 * different places, none of which can see the popup. They all ask `isAdvanceSuspended` instead.
 *
 * Constructing a GameState needs a live game and a React stage, so these drive the methods against
 * a minimal stub `this`, the idiom the rest of the player tests use.
 */

type SuspensionThis = {
    advanceSuspensions: Set<symbol>;
};

function createState(): SuspensionThis {
    return { advanceSuspensions: new Set<symbol>() };
}

const suspend = (state: SuspensionThis) => GameState.prototype.suspendAdvance.call(state as never);
const isSuspended = (state: SuspensionThis) =>
    GameState.prototype.isAdvanceSuspended.call(state as never);

describe("advance suspension", () => {
    it("is not suspended to begin with", () => {
        expect(isSuspended(createState())).toBe(false);
    });

    it("holds the line until the hold is released", () => {
        const state = createState();

        const release = suspend(state);
        expect(isSuspended(state)).toBe(true);

        release();
        expect(isSuspended(state)).toBe(false);
    });

    it("stays held until the last of several holds is released", () => {
        const state = createState();

        const first = suspend(state);
        const second = suspend(state);

        first();
        // A second popup is still open. Releasing the first must not resume the line under it.
        expect(isSuspended(state)).toBe(true);

        second();
        expect(isSuspended(state)).toBe(false);
    });

    it("ignores a release called more than once", () => {
        const state = createState();

        const first = suspend(state);
        const second = suspend(state);
        first();
        first();

        // A double release must not eat the other hold - a component unmounting twice under React's
        // strict mode would otherwise resume a line that is still covered.
        expect(isSuspended(state)).toBe(true);

        second();
        expect(isSuspended(state)).toBe(false);
    });
});
