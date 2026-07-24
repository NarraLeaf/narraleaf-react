import { GameState, PlayerStateElement } from "@player/gameState";
import { AnimatePresence } from "motion/react";
import { useEffect, useReducer, useRef } from "react";
import PlayerDialog from "../say/UIDialog";
import PlayerMenu from "@lib/game/player/elements/menu/PlayerMenu";
import clsx from "clsx";
import React from "react";
import { DialogAction } from "../say/type";

type DialogPresenceState = {
    slotKeys: Map<number, string>;
    exitingKeys: Set<string>;
    menuPromptIds: WeakMap<PlayerStateElement["menus"][number], string>;
    nextKey: number;
};

type DialogRenderItem = {
    action: DialogAction;
    onFinished?: (skiped?: boolean) => void;
    useTypeEffect: boolean;
    presenceKey: string;
    slot: number;
    active: boolean;
};

type DialogSource = {
    action: DialogAction;
    onFinished?: (skiped?: boolean) => void;
    useTypeEffect: boolean;
    slot: number;
};

const DIRECT_DIALOG_REPLACEMENT_GRACE_MS = 120;

/**
 * The scene's dialog box and menus.
 *
 * Rendered as a fixed overlay **outside** the stage {@link Camera} so a camera pan/zoom/rotate
 * moves only the backgrounds and sprites, never the text UI. Split out of the scene stage; it
 * owns all of the dialog-presence bookkeeping.
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

    const dialogItems: DialogRenderItem[] = (() => {
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

        if (dialogSources.length === 0) {
            if (!retainedDialogItemsRef.current && lastActiveDialogItemsRef.current.length > 0) {
                retainedDialogItemsRef.current = lastActiveDialogItemsRef.current.map((item) => ({
                    ...item,
                    active: false,
                }));
            }

            if (retainedDialogItemsRef.current && !retainedDialogTimerRef.current) {
                retainedDialogTimerRef.current = setTimeout(
                    commitRetainedDialogExit,
                    DIRECT_DIALOG_REPLACEMENT_GRACE_MS,
                );
            }

            return retainedDialogItemsRef.current ?? [];
        }

        clearRetainedDialogTimer();
        retainedDialogItemsRef.current = null;

        const activeSlots = new Set(dialogSources.map(({ slot }) => slot));

        for (const [slot, key] of Array.from(presence.slotKeys)) {
            if (activeSlots.has(slot)) continue;
            presence.exitingKeys.add(key);
            presence.slotKeys.delete(slot);
        }

        const activeItems = dialogSources.map(({ slot, ...source }) => {
            let presenceKey = presence.slotKeys.get(slot);
            if (!presenceKey || presence.exitingKeys.has(presenceKey)) {
                presenceKey = `say-${scene.getId()}-${presence.nextKey++}`;
                presence.slotKeys.set(slot, presenceKey);
            }
            return {
                ...source,
                presenceKey,
                slot,
                active: true,
            };
        });
        lastActiveDialogItemsRef.current = activeItems;
        return activeItems;
    })();

    return (
        <div className={clsx(className, "w-full h-full absolute")} data-element-type={"scene-dialogs"}>
            <AnimatePresence
                propagate={state.game.config.animationPropagate}
                onExitComplete={() => {
                    dialogPresenceRef.current.exitingKeys.clear();
                }}
            >
                {dialogItems.map(({ action, onFinished, presenceKey, active, useTypeEffect }) => (
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
