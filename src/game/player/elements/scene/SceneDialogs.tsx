import { GameState, PlayerStateElement } from "@player/gameState";
import { AnimatePresence } from "motion/react";
import { useEffect, useReducer, useRef } from "react";
import PlayerDialog from "../say/UIDialog";
import PlayerMenu from "@lib/game/player/elements/menu/PlayerMenu";
import clsx from "clsx";
import React from "react";
import {
    DIRECT_DIALOG_REPLACEMENT_GRACE_MS,
    DialogPresenceState,
    DialogRenderItem,
    DialogSource,
    resolveDialogPresentation,
} from "./dialogPresentation";

/**
 * The scene's dialog box and menus.
 *
 * Rendered as a fixed overlay **outside** the stage {@link Camera} so a camera pan/zoom/rotate
 * moves only the backgrounds and sprites, never the text UI. Split out of the scene stage; it
 * owns all of the dialog-presence bookkeeping.
 *
 * What it renders, and whether it takes the pointer at all, is decided by
 * {@link resolveDialogPresentation} - a pure function, so the rules it enforces can be pinned
 * without a DOM.
 * @internal
 */
export default function SceneDialogs(
    {
        state,
        className,
        elements,
    }: Readonly<{
        state: GameState;
        className?: string;
        elements: PlayerStateElement;
    }>) {
    const { scene, texts, menus } = elements;
    const usingSkipRef = useRef(false);
    const dialogPresenceRef = useRef<DialogPresenceState>({
        slotKeys: new Map(),
        exitingKeys: new Set(),
        menuPromptIds: new WeakMap(),
        nextKey: 0,
    });
    const lastActiveDialogItemsRef = useRef<DialogRenderItem[]>([]);
    const retainedDialogItemsRef = useRef<DialogRenderItem[] | null>(null);
    const retainedDialogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [, forceDialogPresenceUpdate] = useReducer((count: number) => count + 1, 0);

    const clearRetainedDialogTimer = () => {
        if (retainedDialogTimerRef.current) {
            clearTimeout(retainedDialogTimerRef.current);
            retainedDialogTimerRef.current = null;
        }
    };

    const commitRetainedDialogExit = () => {
        const retainedItems = retainedDialogItemsRef.current;
        if (!retainedItems) {
            return;
        }

        const presence = dialogPresenceRef.current;
        retainedItems.forEach(({ slot, presenceKey }) => {
            if (presence.slotKeys.get(slot) === presenceKey) {
                presence.slotKeys.delete(slot);
            }
            presence.exitingKeys.add(presenceKey);
        });

        retainedDialogItemsRef.current = null;
        retainedDialogTimerRef.current = null;
        lastActiveDialogItemsRef.current = [];
        forceDialogPresenceUpdate();
    };

    useEffect(() => {
        return () => {
            clearRetainedDialogTimer();
        };
    }, []);

    const presence = dialogPresenceRef.current;
    const dialogSources: DialogSource[] = texts.length > 0
        ? texts.map(({ action, onClick }, index) => ({
            action,
            slot: index,
            useTypeEffect: !usingSkipRef.current,
            onFinished: (skiped?: boolean) => {
                if (skiped !== undefined) {
                    usingSkipRef.current = skiped;
                }
                onClick();
                state.events.emit(GameState.EventTypes["event:state.player.lineEnd"]);
                state.stage.next();
            },
        }))
        : menus.flatMap((menu, index) => {
            if (!menu.action.prompt || !menu.action.words) {
                return [];
            }

            let menuPromptId = presence.menuPromptIds.get(menu);
            if (!menuPromptId) {
                menuPromptId = `menu-prompt-${scene.getId()}-${presence.nextKey++}`;
                presence.menuPromptIds.set(menu, menuPromptId);
            }

            return [{
                action: {
                    sentence: menu.action.prompt,
                    words: menu.action.words,
                    character: null,
                    id: menuPromptId,
                },
                slot: index,
                useTypeEffect: false,
            }];
        });

    const presentation = resolveDialogPresentation({
        sources: dialogSources,
        menuCount: menus.length,
        presence,
        retained: retainedDialogItemsRef.current,
        lastActive: lastActiveDialogItemsRef.current,
        sceneId: scene.getId(),
    });

    retainedDialogItemsRef.current = presentation.retained;
    lastActiveDialogItemsRef.current = presentation.lastActive;

    if (presentation.retaining) {
        if (!retainedDialogTimerRef.current) {
            retainedDialogTimerRef.current = setTimeout(
                commitRetainedDialogExit,
                DIRECT_DIALOG_REPLACEMENT_GRACE_MS,
            );
        }
    } else {
        clearRetainedDialogTimer();
    }

    return (
        <div
            className={clsx(className, "w-full h-full absolute")}
            data-element-type={"scene-dialogs"}
            // A layer with nothing live in it is transparent to the pointer. Every scene on the
            // stage has one of these, they all cover the stage, and a scene parked behind a
            // returnable jump keeps its own - so the layer drawn on top is routinely one with
            // nothing in it at all. Left interactive, it took every click meant for the box
            // underneath it.
            style={{ pointerEvents: presentation.interactive ? "auto" : "none" }}
        >
            <AnimatePresence
                propagate={state.game.config.animationPropagate}
                onExitComplete={() => {
                    dialogPresenceRef.current.exitingKeys.clear();
                }}
            >
                {presentation.items.map(({ action, onFinished, presenceKey, active, useTypeEffect }) => (
                    <PlayerDialog
                        gameState={state}
                        key={presenceKey}
                        action={action}
                        active={active}
                        onFinished={onFinished}
                        useTypeEffect={useTypeEffect}
                    />
                ))}
            </AnimatePresence>
            {menus.map(({ action, onClick }, i) => (
                <div key={"menu-" + i} data-element-type={"menu"}>
                    <PlayerMenu
                        state={state}
                        prompt={action.prompt}
                        choices={action.choices}
                        renderPrompt={!action.prompt}
                        afterChoose={(choice) => {
                            usingSkipRef.current = false;

                            onClick(choice);
                            state.stage.next();
                        }}
                        words={action.words}
                    />
                </div>
            ))}
        </div>
    );
}
