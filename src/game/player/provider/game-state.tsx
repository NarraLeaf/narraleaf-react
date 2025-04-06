"use client";

import "client-only";
import React, {ReactNode, useContext, useState} from "react";
import {Game} from "@core/game";

/**
 * Context type definition for game state management
 */
type GameContextType = {
    game: Game;
    setGame: (update: (prevGame: Game) => Game) => void;
};

const GameContext = React.createContext<GameContextType | null>(null);

/**
 * Game state provider component
 * Provides game state context to all child components
 * @param children - React children components
 * @param game - Optional initial game instance
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
 * Custom hook to access game state context
 * @returns GameContextType object containing game instance and setter
 * @throws Error if used outside of GameProvider
 */
export function useGame(): GameContextType {
    const context = useContext(GameContext);
    if (!context) throw new Error("useGame must be used within a GameProvider");
    return context;
}