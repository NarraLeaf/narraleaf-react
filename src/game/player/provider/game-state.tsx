"use client";

import React, {ReactNode, useContext, useState} from "react";
import {Game} from "@core/game";

type GameContextType = {
    game: Game;
    setGame: (update: (prevGame: Game) => Game) => void;
};

const GameContext = React.createContext<GameContextType | null>(null);

export function GameProvider({children}: { children: ReactNode }) {
    "use client";
    const DefaultValue = new Game({});
    const [game, setGame] = useState<Game>(DefaultValue);

    return (
        <GameContext.Provider value={{game, setGame}}>
            {children}
        </GameContext.Provider>
    );
}

export function useGame(): GameContextType {
    const context = useContext(GameContext);
    if (!context) throw new Error("useGame must be used within a GameProvider");
    return context;
}