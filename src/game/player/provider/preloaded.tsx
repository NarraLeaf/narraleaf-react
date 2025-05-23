"use client";

import React, {createContext, useContext, useState} from "react";
import {Preloaded} from "@player/lib/Preloaded";
import {ImageCacheManager} from "@player/lib/ImageCacheManager";
import { useGame } from "./game-state";

type PreloadedContextType = {
    preloaded: Preloaded;
    cacheManager: ImageCacheManager;
};

const PreloadedContext = createContext<null | PreloadedContextType>(null);

/**@internal */
export function PreloadedProvider({children}: {
    children: React.ReactNode
}) {
    const game = useGame();
    const [preloaded] = useState(() => new Preloaded());
    const [cacheManager] = useState(() => new ImageCacheManager(game));

    return (
        <>
            <PreloadedContext value={{preloaded, cacheManager}}>
                {children}
            </PreloadedContext>
        </>
    );
}

/**@internal */
export function usePreloaded(): PreloadedContextType {
    if (!PreloadedContext) throw new Error("usePreloaded must be used within a PreloadedProvider");
    return useContext(PreloadedContext) as PreloadedContextType;
}

