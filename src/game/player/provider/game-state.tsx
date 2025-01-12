"use client";

import "client-only";
import React, {ReactNode, useContext, useState} from "react";
import {Game} from "@core/game";

type GameContextType = {
    game: Game;
    setGame: (update: (prevGame: Game) => Game) => void;
};

const GameContext = React.createContext<GameContextType | null>(null);

/**
 * @internal
 */
export function GameProvider({children, game}: { children?: ReactNode, game?: Game }) {
    "use client";
    const DefaultValue = new Game({});
    const [_game, setGame] = useState<Game>(game || DefaultValue);

    return (
        <GameContext value={{game: _game, setGame}}>
            {children}
        </GameContext>
    );
}

/**
 * use {@link Game} context
 * @returns {GameContextType}
 */
export function useGame(): GameContextType {
    const context = useContext(GameContext);
    if (!context) throw new Error("useGame must be used within a GameProvider");
    return context;
}