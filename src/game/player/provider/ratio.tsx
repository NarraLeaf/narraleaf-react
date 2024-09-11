"use client";

import React, {createContext, useContext, useState} from "react";

type Ratio = {
    w: number;
    h: number;
    updateStyle: () => void;
    style: React.CSSProperties;
    s: {
        style: React.CSSProperties;
    };
    min: {
        w: number;
        h: number;
    };
}
type ThemeContextType = {
    ratio: Ratio;
    setRatio: (ratio: Ratio) => void;
};

const DefaultValue: Ratio = {
    w: 0,
    h: 0,
    updateStyle: () => void 0,
    style: {},
    s: {
        style: {}
    },
    min: {
        w: 800,
        h: 450
    },
};
const Context = createContext<null | ThemeContextType>(null);

export function AspectRatioProvider({children}: {
    children: React.ReactNode
}) {
    const [ratio, setRatio] = useState(DefaultValue);

    return (
        <>
            <Context.Provider value={{ratio: ratio, setRatio: setRatio}}>
                {children}
            </Context.Provider>
        </>
    );
}

export function useAspectRatio(): ThemeContextType {
    if (!Context) throw new Error("useAspectRatio must be used within a AspectRatioProvider");
    return useContext(Context) as ThemeContextType;
}

