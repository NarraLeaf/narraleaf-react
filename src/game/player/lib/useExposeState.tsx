import {GameState} from "@player/gameState";
import {ExposedKeys, ExposedState, ExposedStateType} from "@player/type";
import React, {useEffect} from "react";
import {useGame} from "@player/provider/game-state";

export function useExposeState<T extends ExposedStateType>(
    key: ExposedKeys[T],
    value: ExposedState[T] | (() => ExposedState[T]),
    deps: React.DependencyList = []
): [] {
    const {game} = useGame();
    const gameState: GameState = game.getLiveGame().getGameState()!;

    useEffect(() => {
        const initState = typeof value === "function" ? (value as () => ExposedState[T])() : value;
        return gameState.mountState<T>(key, initState).unMount;
    }, [...deps]);

    return [];
}

