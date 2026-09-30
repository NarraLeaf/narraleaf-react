import { ControlAction } from "../../action/actions/controlAction";
import { Chained, Proxied } from "../../action/chain";
import { GameState } from "../../common/game";
import { LogicAction } from "../../game";
import type { LiveGameEventToken } from "../../types";
import { Control } from "../control";
import { Image } from "../displayable/image";
import { Puppet } from "../displayable/puppet";
import { Layer } from "../layer";
import { DynamicPersistent, Persistent } from "../persistent";
import { Scene } from "../scene";
import type { Game } from "../../game";
import type { PuppetDescription, PuppetState, PuppetStatus } from "../../game/puppet/puppetBackend";

/** Snapshot of the dialog line currently presented to the player (ADV or NVL). */
export type DevToolsCurrentDialog = {
    /** Id of the say action that produced the line (static id when assigned). */
    actionId: string | null;
    /** True once the line finished displaying and awaits advance. */
    ended: boolean;
    mode: "adv" | "nvl";
};


export class DevTools {
    public static getActionId(action: LogicAction.Actions): string {
        return action.getId();
    }

    public static setActionId(action: LogicAction.Actions, id: string): LogicAction.Actions {
        action.setId(id);
        return action;
    }

    public static getStaticId(action: LogicAction.Actions): string | null {
        return action.getStaticId();
    }

    public static setStaticId(action: LogicAction.Actions, id: string | null): LogicAction.Actions {
        action.setStaticId(id);
        return action;
    }

    public static chainToActions(chain: Proxied<LogicAction.GameElement, Chained<LogicAction.Actions>>): LogicAction.Actions[] {
        return chain.getActions();
    }

    public static wrapAction(action: LogicAction.Actions[] | Proxied<LogicAction.GameElement, Chained<LogicAction.Actions>>): ControlAction {
        const actions = Chained.isChained(action) ? action.getActions() : action;
        return Control.do(actions);
    }

    public static getNamespaceName(persistent: Persistent<any>): string {
        return persistent.getNamespaceName();
    }

    public static getCurrentScene(gameState: GameState): Scene | null {
        return gameState.getCurrentScene();
    }

    /**
     * The src of each of a layered image's layers, bottom to top, for the given tags (the image's
     * current ones when omitted). `null` entries are layers that draw nothing; a non-layered image
     * yields an empty array.
     *
     * A layered image has no single src to read — it is a stack — so an editor host that renders
     * its own thumbnail of an on-stage element has to composite these itself, in order.
     */
    public static getLayerSrcs(image: Image, tags?: string[]): (string | null)[] {
        return Image.getSrcURLs(image, tags);
    }

    /**
     * Register a displayable into a scene's render tree without emitting a `displayable:init`
     * action. The element renders immediately at its constructor-config transform state
     * (visibility is governed by `opacity > 0`).
     *
     * Intended for editor hosts that pre-pose a stage: construct elements with their computed
     * state as constructor config (config state survives `element.reset()` / `newGame()`), then
     * register them from a `Script` action or after mount.
     */
    public static registerDisplayable(
        gameState: GameState,
        displayable: LogicAction.DisplayableElements,
        scene: Scene | null = null,
        layer: Layer | null = null,
    ): void {
        // Idempotent: the scene root's auto-init actions may already have registered the
        // element (any displayable referenced by a compiled action is auto-inited on mount).
        if (gameState.findElementByDisplayable(displayable)) {
            return;
        }
        gameState.createDisplayable(displayable, scene, layer);
        gameState.flush();
    }

    /**
     * Assign an explicit element id. Elements reachable from a scene's action tree receive
     * generated ids (`e-0`, `e-1`, ...) at story construction, but elements registered directly
     * via {@link registerDisplayable} are outside the tree and would otherwise share the default
     * id — colliding as React keys. Editor hosts should give those elements unique ids
     * (use a distinct prefix so they never collide with generated ids).
     */
    public static setElementId(element: LogicAction.GameElement, id: string): void {
        element.setId(id);
    }

    /**
     * Name an element from the host's own documents, so story construction keeps that name instead
     * of the position it happened to occupy.
     *
     * Unlike {@link setElementId}, this survives construction: generated ids are assigned after a
     * host has finished building, and an id set with `setElementId` is overwritten there for
     * anything the action tree reaches. Hosts that restore saved state should use this - a
     * generated id moves to a different element the moment a line is written ahead of it, and the
     * state a save carries then lands on the wrong element with nothing reporting it.
     */
    public static setElementStaticId(element: LogicAction.GameElement, id: string | null): void {
        element.setStaticId(id);
    }

    /**
     * Read a displayable's current transform-state props (position/opacity/zoom/rotation/scale/
     * effects...). Returns a shallow copy. Intended for editor hosts capturing a live pose
     * (e.g. prefilling a motion editor with an element's current stage state).
     */
    public static getDisplayableTransformProps(
        displayable: LogicAction.DisplayableElements,
    ): Record<string, unknown> {
        return { ...displayable.transformState.get() };
    }

    /**
     * Overwrite a displayable's transform-state props with no animation and push the result to
     * the DOM immediately when the element is mounted. With `merge: false` the previous state is
     * discarded entirely; by default the given props are merged over the current state.
     *
     * Throws if the transform state is locked by an in-flight transform — editor hosts should
     * only inject while the stage is idle.
     */
    public static setDisplayableTransformProps(
        gameState: GameState,
        displayable: LogicAction.DisplayableElements,
        props: Record<string, unknown>,
        options: { merge?: boolean } = {},
    ): void {
        const transformState = displayable.transformState;
        if (options.merge === false) {
            transformState.forceOverwrite(props as never);
        } else {
            transformState.assign(Symbol("DevTools.setDisplayableTransformProps"), props as never);
        }
        // This writes element state from outside the action dispatch, which is the one place the
        // engine marks elements itself — so it has to say so, or the pose it just set would be
        // missing from the next save with nothing reporting it.
        displayable.markDirty();

        const exposed = gameState.getExposedState(displayable as never) as { updateStyleSync?: () => void } | null;
        exposed?.updateStyleSync?.();
        gameState.flush();
    }

    /**
     * The current state of a puppet's backend instance.
     *
     * `"missing-backend"` is the one an editor host should surface loudly: the element is on stage
     * and behaving in every other respect, but nothing is drawing it, because the renderer the
     * project depends on was never registered.
     */
    public static getPuppetStatus(puppet: Puppet): PuppetStatus {
        return puppet._getStatus();
    }

    /**
     * Subscribe to a puppet's status changes. The listener receives the new status.
     */
    public static onPuppetStatusChange(
        puppet: Puppet,
        listener: (status: PuppetStatus) => void,
    ): LiveGameEventToken {
        return puppet._onStatusChange(listener);
    }

    /**
     * Ask a puppet's backend to describe its model — the motions, expressions, skins and parameters
     * it can be driven with.
     *
     * This is what keeps model-format parsers out of an editor host: the inspector fills its
     * dropdowns from the live instance. Returns null when the puppet is not mounted or its backend
     * does not implement `describe`, in which case a host should fall back to free text.
     */
    public static async describePuppet(
        gameState: GameState,
        puppet: Puppet,
    ): Promise<PuppetDescription | null> {
        try {
            return await puppet._describe();
        } catch (e) {
            gameState.logger.error("DevTools", "Puppet backend threw while describing itself", e);
            return null;
        }
    }

    /**
     * Read a puppet's persistent state. Returns a copy, `params` and `slots` included, so a host can
     * hold on to it without aliasing the element.
     */
    public static getPuppetState(puppet: Puppet): PuppetState {
        return Puppet.normalizeState(puppet.state);
    }

    /**
     * Overwrite a puppet's state and push it to the backend at once, without going through an
     * action (so nothing lands in the story's history).
     *
     * By default the patch is merged over the current state, with `params` and `slots` merged key by
     * key; with `merge: false` the state is replaced outright. Applying to an unmounted puppet is
     * valid and does not warn — the state is complete by construction, so it is applied in full the
     * next time the element mounts.
     */
    public static setPuppetState(
        gameState: GameState,
        puppet: Puppet,
        patch: Partial<PuppetState>,
        options: { merge?: boolean } = {},
    ): void {
        puppet.state = options.merge === false
            ? Puppet.normalizeState(patch)
            : Puppet.mergeState(puppet.state, patch);
        puppet._applyState().catch((e) => {
            gameState.logger.error("DevTools", "Puppet backend threw while applying state", e);
        });
        gameState.flush();
    }

    /**
     * Run a named command on a puppet's backend and wait for it.
     *
     * The engine never interprets the command; it is the escape hatch for everything the persistent
     * state deliberately does not model (one-shot motions, hit tests, lip sync). Resolves without
     * doing anything when the puppet is not mounted.
     */
    public static async runPuppetCommand(
        gameState: GameState,
        puppet: Puppet,
        name: string,
        payload: unknown,
    ): Promise<void> {
        try {
            const ran = await puppet._runCommand(name, payload);
            if (!ran) {
                gameState.logger.weakWarn(
                    "DevTools",
                    `Puppet command "${name}" was dropped: the puppet is not mounted.`
                );
            }
        } catch (e) {
            gameState.logger.error("DevTools", `Puppet backend threw while running "${name}"`, e);
        }
    }

    /**
     * The names of every puppet backend registered on this game.
     */
    public static listPuppetBackends(game: Game): string[] {
        return game.listPuppetBackends();
    }

    /**
     * Read the dialog line currently presented to the player, or null when no
     * dialog is on screen. Covers both ADV (tracked via GameState.beginAdvDialog)
     * and NVL (active entry + phase) presentation.
     */
    public static getCurrentDialog(gameState: GameState): DevToolsCurrentDialog | null {
        if (gameState.isNvlMode()) {
            const nvlState = gameState.getNvlState();
            if (!nvlState.activeDialogId || nvlState.phase === "idle") {
                return null;
            }
            const entry = gameState.getNvlDialog(nvlState.activeDialogId);
            if (!entry) {
                return null;
            }
            return {
                actionId: entry.actionId || null,
                ended: nvlState.phase === "awaitAdvance",
                mode: "nvl",
            };
        }
        const adv = gameState.getAdvDialogState();
        if (!adv) {
            return null;
        }
        return {
            actionId: adv.actionId,
            ended: adv.ended,
            mode: "adv",
        };
    }

    /**
     * Subscribe to changes of the currently presented dialog line (creation,
     * typing completion, advance/settle) across ADV and NVL modes. The listener
     * carries no payload; call {@link getCurrentDialog} to read the new state.
     */
    public static onDialogStateChange(gameState: GameState, listener: () => void): LiveGameEventToken {
        const tokens = [
            gameState.events.on(GameState.EventTypes["event:state.dialog.change"], listener),
            gameState.events.on(GameState.EventTypes["event:state.nvl.change"], listener),
        ];
        return {
            cancel: () => {
                for (const token of tokens) {
                    token.cancel();
                }
            },
        };
    }

    public static DynamicPersistent = DynamicPersistent;
}
