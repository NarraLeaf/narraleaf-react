"use client";

import "client-only";
import React from "react";
import {PreloadedProvider} from "@player/provider/preloaded";
import {AspectRatioProvider} from "@player/provider/ratio";
import {GameProvider} from "@player/provider/game-state";

export default function GameProviders({children}: Readonly<{
    children?: React.ReactNode;
}>) {
    return (
        <>
            <AspectRatioProvider>
                <GameProvider>
                    <PreloadedProvider>
                        {children}
                    </PreloadedProvider>
                </GameProvider>
            </AspectRatioProvider>
        </>
    );
}

