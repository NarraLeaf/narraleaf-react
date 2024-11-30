"use client";

import React, {createContext, useContext, useState} from "react";
import {Preloaded} from "@player/lib/Preloaded";
import {ImageCacheManager} from "@player/lib/ImageCacheManager";

type PreloadedContextType = {
    preloaded: Preloaded;
    cacheManager: ImageCacheManager;
};

const Context = createContext<null | PreloadedContextType>(null);

export function PreloadedProvider({children}: {
    children: React.ReactNode
}) {
    const [preloaded] = useState(new Preloaded());
    const [cacheManager] = useState(new ImageCacheManager());

    return (
        <>
            <Context.Provider value={{preloaded, cacheManager}}>
                {children}
            </Context.Provider>
        </>
    );
}

export function usePreloaded(): PreloadedContextType {
    if (!Context) throw new Error("usePreloaded must be used within a PreloadedProvider");
    return useContext(Context) as PreloadedContextType;
}

