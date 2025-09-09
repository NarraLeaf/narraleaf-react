import { GameState } from "@lib/game/player/gameState";
import { Chosen } from "@player/type";
import React from "react";
import { ChoiceEvaluated } from "../type";

/* Ui Menu Context */
interface UIMenuContext {
    evaluated: ChoiceEvaluated[];
    choose: (choice: Chosen) => void;
    gameState: GameState;
}

export const UIMenuContext = React.createContext<UIMenuContext | null>(null);

export function useUIMenuContext() {
    const context = React.useContext(UIMenuContext);
    if (!context) {
        throw new Error("useUIMenuContext must be used within a UIMenuContext");
    }
    return context;
}

/* Ui List Context */
interface UIListContext {
    register: (ref: React.RefObject<HTMLElement>) => number;
    unregister: (ref: React.RefObject<HTMLElement>) => void;
    getIndex: (ref: React.RefObject<HTMLElement>) => number;
}

export const UIListContext = React.createContext<UIListContext | null>(null);

export function useUIListContext() {
    const context = React.useContext(UIListContext);
    if (!context) {
        throw new Error("useUIListContext must be used within a UIListContext");
    }
    return context;
}
