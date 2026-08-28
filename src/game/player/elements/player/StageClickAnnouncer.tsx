import React, { useEffect } from "react";
import { useGame } from "@player/provider/game-state";
import { GameState } from "@player/gameState";
import { Game } from "@core/game";
import { resolveStageClickIntent } from "./stageClickIntent";

/**
 * Check if an element is inside the PageRouter GUI layer
 * by traversing up the DOM tree looking for the data-layout-path attribute
 */
function isInsidePageRouter(element: HTMLElement | null): boolean {
    let current: HTMLElement | null = element;
    while (current) {
        if (current.hasAttribute("data-layout-path")) {
            return true;
        }
        current = current.parentElement;
    }
    return false;
}

const NVL_ELEMENT_SELECTORS = [
    "[data-element-type=\"nvl-container\"]",
    "[data-element-type=\"nvl-dialog-list\"]",
    "[data-element-type=\"nvl-dialog-item\"]",
];

const GUI_ELEMENT_SELECTORS = [
    "[data-layout-path]",
    "[data-element-type=\"menu\"]",
    "[data-element-type=\"notification\"]",
    // A custom-rendered word that has finished revealing, and anything a line has drawn over
    // itself. Both take their own clicks: the player aiming at a glossary term meant the term, not
    // the next line. A word still being typed carries no such marker, so clicking it skips the
    // typing as clicking anywhere else does.
    "[data-element-type=\"interactive-word\"]",
    "[data-element-type=\"dialog-overlay\"]",
];

function isInsideGuiElement(target: Element | null, allowNvlClick: boolean): boolean {
    if (!target) {
        return false;
    }
    if (allowNvlClick && NVL_ELEMENT_SELECTORS.some(selector => !!target.closest(selector))) {
        return false;
    }
    return [...GUI_ELEMENT_SELECTORS, ...NVL_ELEMENT_SELECTORS].some(selector => !!target.closest(selector));
}

function isPointInsideElement(event: MouseEvent, element: HTMLElement | null): boolean {
    if (!element) {
        return false;
    }
    const rect = element.getBoundingClientRect();
    return event.clientX >= rect.left
        && event.clientX <= rect.right
        && event.clientY >= rect.top
        && event.clientY <= rect.bottom;
}

/**@internal */
export function StageClickAnnouncer({ state }: Readonly<{
    state: GameState;
}>) {
    const game = useGame();

    useEffect(() => {
        const playerElement = game.getLiveGame().gameState?.playerCurrent;
        if (!playerElement) {
            state.logger.warn("StageClickAnnouncer", "Failed to listen to playerElement events");
            return;
        }

        const handleClick = (event: MouseEvent) => {
            const target = event.target as Element | null;

            if (!target) {
                return;
            }

            if (!playerElement.contains(target)) {
                return;
            }

            if (!isPointInsideElement(event, playerElement)) {
                return;
            }

            const mainContentNode = state.mainContentNode;
            if (mainContentNode) {
                if (!mainContentNode.contains(target)) {
                    return;
                }
                if (!isPointInsideElement(event, mainContentNode)) {
                    return;
                }
            }

            if (isInsidePageRouter(target as HTMLElement)) {
                return;
            }

            if (isInsideGuiElement(target, state.isNvlMode())) {
                return;
            }

            // Everything above answers "is this click the stage's". What it means once it is - and
            // in particular that a click with the box put away brings the box back rather than
            // spending a line nobody saw - is decided away from the DOM, in `resolveStageClickIntent`.
            const intent = resolveStageClickIntent({
                onStage: true,
                dialogShown: game.preference.getPreference(Game.Preferences.showDialog),
                advanceSuspended: state.isAdvanceSuspended(),
            });

            if (intent === "ignore") {
                return;
            }

            if (intent === "restoreDialog") {
                // Read and written at click time rather than through `usePreference`, so the answer
                // is the one that holds now: this listener is attached once and outlives any number
                // of changes to the preference, including the ones it makes itself.
                game.preference.setPreference(Game.Preferences.showDialog, true);
                return;
            }

            state.events.emit(GameState.EventTypes["event:state.player.stageClick"]);
            state.recordStageClick();
        };

        if (game.config.useWindowListener) {
            const token = game.getLiveGame().onWindowEvent("click", handleClick);
            return () => {
                token.cancel();
            };
        } else {
            const token = game.getLiveGame().onPlayerEvent("click", handleClick);
            return () => {
                token.cancel();
            };
        }
    }, [game, state]);

    return (<></>);
}
