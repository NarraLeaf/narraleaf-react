"use client";

import clsx from "clsx";
import React, {useCallback, useEffect, useRef} from "react";
import {useRatio} from "@player/provider/ratio";
import {useGame} from "@player/provider/game-state";
import {GameState} from "@player/gameState";
import {useFlush} from "@player/lib/flush";
import FixedAspectRatioContainer, {
    FixedAspectRatioContainerHandle,
    FixedAspectRatioMetrics,
} from "@player/lib/FixedAspectRatioContainer";

export default function AspectRatio(
    {
        children,
        className,
        gameState,
    }: {
        children: React.ReactNode,
        className?: string;
        gameState: GameState;
    }) {
    const {ratio} = useRatio();
    const game = useGame();
    const [flush] = useFlush();
    const containerRef = useRef<FixedAspectRatioContainerHandle | null>(null);

    const MIN_WIDTH = game.config.minWidth;
    const MIN_HEIGHT = game.config.minHeight;

    const handleAspectUpdate = useCallback((metrics: FixedAspectRatioMetrics) => {
        if (ratio.isLocked()) {
            gameState.logger.weakWarn("AspectRatio", "ratio is locked, skipping update");
            return;
        }

        ratio.update(metrics.width, metrics.height, metrics.scale);
        ratio.updateMin(MIN_WIDTH, MIN_HEIGHT);
        flush();
    }, [flush, gameState.logger, MIN_HEIGHT, MIN_WIDTH, ratio]);

    useEffect(() => {
        ratio.setUpdate(() => {
            containerRef.current?.requestUpdate();
        });
    }, [ratio]);

    useEffect(() => {
        const cancelToken = ratio.onRequestedUpdate(() => {
            containerRef.current?.requestUpdate();
        });

        return cancelToken;
    }, [ratio]);

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            containerRef.current?.requestUpdate();
        });

        return () => {
            cancelAnimationFrame(frame);
        };
    }, [game.config.aspectRatio, game.config.height, game.config.width, MIN_HEIGHT, MIN_WIDTH]);

    useEffect(() => {
        return gameState.events.on(GameState.EventTypes["event:state.player.requestFlush"], flush).cancel;
    }, [gameState, flush]);

    return (
        <FixedAspectRatioContainer
            ref={containerRef}
            id={game.config.contentContainerId}
            aspectRatio={game.config.aspectRatio}
            baseWidth={game.config.width}
            minWidth={MIN_WIDTH}
            minHeight={MIN_HEIGHT}
            debounceMs={game.config.ratioUpdateInterval}
            className={clsx(className)}
            onUpdate={handleAspectUpdate}
        >
            {children}
        </FixedAspectRatioContainer>
    );
};