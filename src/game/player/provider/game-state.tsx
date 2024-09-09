"use client";

import {ClientGame} from "@lib/game/game";
import {createContext, ReactNode, useContext, useState} from "react";

type GameContextType = {
    game: ClientGame;
    setGame: (update: (prevGame: ClientGame) => ClientGame) => void;
};

const GameContext = createContext<GameContextType | null>(null);

export function GameProvider({children}: { children: ReactNode }) {
    "use client";
    const DefaultValue = new ClientGame({}, {});
    const [game, setGame] = useState<ClientGame>(DefaultValue);

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