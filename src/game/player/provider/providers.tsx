"use client";

import "client-only";
import React from "react";
import {PreloadedProvider} from "@player/provider/preloaded";
import {AspectRatioProvider} from "@player/provider/ratio";
import {GameProvider} from "@player/provider/game-state";
import {Game} from "@core/game";

export default function GameProviders({children, game}: Readonly<{
    children?: React.ReactNode;
    game?: Game;
}>) {
    return (
        <>
            <AspectRatioProvider>
                <GameProvider game={game}>
                    <PreloadedProvider>
                        {children}
                    </PreloadedProvider>
                </GameProvider>
            </AspectRatioProvider>
        </>
    );
}

