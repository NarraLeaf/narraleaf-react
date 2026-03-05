import React, { useEffect } from "react";
import { useGame } from "@player/provider/game-state";
import { GameState } from "@player/gameState";

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

const GUI_ELEMENT_SELECTORS = [
    "[data-layout-path]",
    "[data-element-type=\"dialog\"]",
    "[data-element-type=\"menu\"]",
    "[data-element-type=\"notification\"]",
    "[data-element-type=\"nvl-container\"]",
    "[data-element-type=\"nvl-dialog-list\"]",
    "[data-element-type=\"nvl-dialog-item\"]",
];

function isInsideGuiElement(target: Element | null): boolean {
    if (!target) {
        return false;
    }
    return GUI_ELEMENT_SELECTORS.some(selector => !!target.closest(selector));
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

            if (isInsideGuiElement(target)) {
                return;
            }

            state.events.emit(GameState.EventTypes["event:state.player.stageClick"]);
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
