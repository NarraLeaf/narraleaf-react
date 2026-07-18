import { ControlAction } from "../../action/actions/controlAction";
import { Chained, Proxied } from "../../action/chain";
import { GameState } from "../../common/game";
import { LogicAction } from "../../game";
import type { LiveGameEventToken } from "../../types";
import { Control } from "../control";
import { Layer } from "../layer";
import { DynamicPersistent, Persistent } from "../persistent";
import { Scene } from "../scene";

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
        const exposed = gameState.getExposedState(displayable as never) as { updateStyleSync?: () => void } | null;
        exposed?.updateStyleSync?.();
        gameState.flush();
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
