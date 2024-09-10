"use client";

import React, {createContext, useContext, useState} from "react";
import {Preloaded} from "@player/lib/Preloaded";

type PreloadedContextType = {
    preloaded: Preloaded;
};

const Context = createContext<null | PreloadedContextType>(null);

export function PreloadedProvider({children}: {
    children: React.ReactNode
}) {
    const [preloaded] = useState(new Preloaded());

    return (
        <>
            <Context.Provider value={{preloaded: preloaded}}>
                {children}
            </Context.Provider>
        </>
    );
}

export function usePreloaded(): PreloadedContextType {
    if (!Context) throw new Error("usePreloaded must be used within a PreloadedProvider");
    return useContext(Context) as PreloadedContextType;
}

