import {GameState} from "@player/gameState";
import {ExposedKeys, ExposedState, ExposedStateType} from "@player/type";
import React, {useEffect} from "react";
import {useGame} from "@player/provider/game-state";

/**
 * Custom hook for exposing state to the game state manager
 * @param key - Unique identifier for the state
 * @param value - State value or function returning state value
 * @param deps - Dependency array for state updates
 * @returns Empty array (for consistency with React hooks)
 */
export function useExposeState<T extends ExposedStateType>(
    key: ExposedKeys[T],
    value: ExposedState[T] | (() => ExposedState[T]),
    deps: React.DependencyList = []
): [] {
    const game = useGame();
    const gameState: GameState = game.getLiveGame().getGameState()!;

    useEffect(() => {
        const initState = typeof value === "function" ? (value as () => ExposedState[T])() : value;
        return gameState.mountState<T>(key, initState).unMount;
    }, [...deps]);

    return [];
}

