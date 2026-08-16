import { PuppetActionContentType, PuppetActionTypes } from "@core/action/actionTypes";
import { TypedAction } from "@core/action/actions";
import { ContentNode } from "@core/action/tree/actionTree";
// Type-only: the element imports this module for its chainable methods, and importing it back as a
// value would close that loop at runtime. Everything this action needs of the element's state rules
// is reachable through the element itself.
import type { Puppet } from "@core/elements/displayable/puppet";
import { GameState } from "@player/gameState";
import { Awaitable, SkipController, Values } from "@lib/util/data";
import type { CalledActionResult } from "@core/gameTypes";
import type { PuppetState } from "@core/game/puppet/puppetBackend";
import { ActionExecutionInjection, ExecutedActionResult } from "@core/action/action";
import { LogicAction } from "@core/action/logicAction";
import { Story } from "@core/elements/story";

/**
 * The story's half of the puppet seam.
 *
 * Two kinds of thing happen here, and the line between them is the same one
 * {@link import("@core/game/puppet/puppetBackend").PuppetState} draws:
 *
 * - The five `set*` types edit the persistent state and then push **the whole of it** to the
 *   backend. They never send a delta, because a delta is exactly what a saved game cannot replay —
 *   restoring is one `apply` of a complete state, so an undo has to be one too.
 * - `command` sends a one-shot the engine does not model and does not interpret. It leaves no state
 *   behind, which is why it is the only one that can take `{await: true}` and the only one an undo
 *   cannot take back.
 */
export class PuppetAction<T extends Values<typeof PuppetActionTypes> = Values<typeof PuppetActionTypes>>
    extends TypedAction<PuppetActionContentType, T, Puppet> {
    static ActionTypes = PuppetActionTypes;

    public executeAction(state: GameState, injection: ActionExecutionInjection): ExecutedActionResult {
        if (this.type === PuppetActionTypes.setMotion) {
            const [motion] =
                (this.contentNode as ContentNode<PuppetActionContentType["puppet:setMotion"]>).getContent();
            return this.patchState(state, injection, { motion });
        } else if (this.type === PuppetActionTypes.setExpression) {
            const [expression] =
                (this.contentNode as ContentNode<PuppetActionContentType["puppet:setExpression"]>).getContent();
            return this.patchState(state, injection, { expression });
        } else if (this.type === PuppetActionTypes.setSkin) {
            const [skin] =
                (this.contentNode as ContentNode<PuppetActionContentType["puppet:setSkin"]>).getContent();
            return this.patchState(state, injection, { skin });
        } else if (this.type === PuppetActionTypes.setParam) {
            const [id, value] =
                (this.contentNode as ContentNode<PuppetActionContentType["puppet:setParam"]>).getContent();
            return this.patchState(state, injection, { params: { [id]: value } });
        } else if (this.type === PuppetActionTypes.setSlot) {
            const [id, value] =
                (this.contentNode as ContentNode<PuppetActionContentType["puppet:setSlot"]>).getContent();
            return this.patchState(state, injection, { slots: { [id]: value } });
        } else if (this.type === PuppetActionTypes.command) {
            const [name, payload, options] =
                (this.contentNode as ContentNode<PuppetActionContentType["puppet:command"]>).getContent();
            return this.runCommand(state, injection, name, payload, options?.await === true);
        }

        throw super.unknownTypeError();
    }

    /**
     * Write a patch over the puppet's state, then hand the backend the complete result.
     *
     * `params` and `slots` merge key by key, so setting one parameter does not silently clear the
     * rest. Undo restores the state as it stood and applies that — one call, no replay, which is the
     * same path a saved game takes.
     */
    private patchState(
        state: GameState,
        injection: ActionExecutionInjection,
        patch: Partial<PuppetState>
    ): ExecutedActionResult {
        const puppet: Puppet = this.callee;
        const previous = puppet._patchState(patch);

        this.pushState(state, puppet);

        state.actionHistory.push<[PuppetState]>({
            action: this,
            stackModel: injection.stackModel
        }, (prevState) => {
            puppet.state = prevState;
            this.pushState(state, puppet);
        }, [previous]);

        return super.executeAction(state, injection);
    }

    /**
     * Push the current state to the backend without making the story wait for it.
     *
     * A pose change is not a beat: an author writing `setExpression("smile")` before a line expects
     * the line, not a pause of whatever length the renderer decides. A backend that throws or
     * rejects is logged and the stage stays alive — it is a renderer this library has never seen,
     * and it does not get to take the game down.
     */
    private pushState(state: GameState, puppet: Puppet): void {
        puppet._applyState().catch((e) => {
            state.logger.error(
                "Puppet",
                `Backend "${puppet.config.backend}" threw while applying state`, e
            );
        });
    }

    /**
     * Forward a one-shot command, optionally waiting for it.
     *
     * Waiting is opt-in ({@link import("@core/elements/displayable/puppet").PuppetCommandOptions}):
     * the engine cannot know whether a command is a motion worth a beat or a parameter nudge, and
     * defaulting to waiting would make every backend that forgets to resolve into a hung story.
     */
    private runCommand(
        state: GameState,
        injection: ActionExecutionInjection,
        name: string,
        payload: unknown,
        shouldAwait: boolean
    ): ExecutedActionResult {
        const puppet: Puppet = this.callee;
        const run = (): Promise<void> => puppet._runCommand(name, payload).then((ran) => {
            if (!ran) {
                state.logger.weakWarn(
                    "Puppet",
                    `Command "${name}" was dropped: the puppet is not on stage. `
                    + "Show the element before commanding it."
                );
            }
        }).catch((e) => {
            state.logger.error(
                "Puppet",
                `Backend "${puppet.config.backend}" threw while running "${name}"`, e
            );
        });

        if (!shouldAwait) {
            // Nothing is pushed to the action history here on purpose: a one-shot leaves no state to
            // restore and no pending wait to abort, so an undo entry would only cost a stack
            // snapshot. What the command did to the model is the backend's, and the engine has no
            // way to ask for it back.
            void run();
            return super.executeAction(state, injection);
        }

        const awaitable = new Awaitable<CalledActionResult>()
            .registerSkipController(new SkipController(() => {
                state.logger.info("Puppet Command", "Skipped");
                return super.executeAction(state, injection) as CalledActionResult;
            }));
        run().then(() => {
            if (!awaitable.isSettled()) {
                awaitable.resolve(super.executeAction(state, injection) as CalledActionResult);
            }
        });

        const timeline = state.timelines.attachTimeline(awaitable);
        state.actionHistory.push({
            action: this,
            stackModel: injection.stackModel,
            timeline
        }, () => {
            // The command itself cannot be undone; the wait for it can, and must be — an undo landing
            // mid-command would otherwise leave the story parked on an awaitable nothing resolves.
            if (!awaitable.isSettled()) {
                awaitable.abort();
            }
        });

        return awaitable;
    }

    stringify(_story: Story, _seen: Set<LogicAction.Actions>, _strict: boolean): string {
        return super.stringifyWithName("PuppetAction");
    }
}
