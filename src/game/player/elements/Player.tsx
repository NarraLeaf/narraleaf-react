import "client-only";

import { Story } from "@core/elements/story";
import { CalledActionResult } from "@core/gameTypes";
import { Awaitable, createMicroTask, EventToken, MultiLock } from "@lib/util/data";
import { KeyEventAnnouncer } from "@player/elements/player/KeyEventAnnouncer";
import PreferenceUpdateAnnouncer from "@player/elements/player/PreferenceUpdateAnnouncer";
import SizeUpdateAnnouncer from "@player/elements/player/SizeUpdateAnnouncer";
import { Preload } from "@player/elements/preload/Preload";
import { default as StageScene } from "@player/elements/scene/Scene";
import { PlayerProps } from "@player/elements/type";
import Video from "@player/elements/video/video";
import { GameState } from "@player/gameState";
import AspectRatio from "@player/lib/AspectRatio";
import Cursor from "@player/lib/Cursor";
import { ErrorBoundary } from "@player/lib/ErrorBoundary";
import Isolated from "@player/lib/isolated";
import { Preloaded } from "@player/lib/Preloaded";
import { useGame } from "@player/provider/game-state";
import { usePreloaded } from "@player/provider/preloaded";
import clsx from "clsx";
import React, { useEffect, useReducer, useState } from "react";
import { flushSync } from "react-dom";
import { RenderEventAnnoucer } from "./player/RenderEventAnnoucer";
import { RuntimeGameError } from "@lib/game/nlcore/common/Utils";
import { StackModel } from "@lib/game/nlcore/action/stackModel";
import { RootLayout } from "../lib/PageRouter/Layout";

export default function Player(
    {
        story = Story.empty(),
        width,
        height,
        className,
        onReady,
        onEnd,
        children,
        active = true,
    }: Readonly<PlayerProps>) {
    const [flushDep, update] = useReducer((x) => x + 1, 0);
    const [key, setKey] = useState(0);
    const game = useGame();
    const [state] = useState<GameState>(() => new GameState(game, {
        update,
        forceUpdate: () => {
            (state as GameState).logger.weakWarn("Player", "force update");
            flushSync(() => {
                update();
            });
        },
        forceRemount: () => {
            (state as GameState).logger.weakWarn("Player", "force remount");
            flushSync(() => {
                setKey(k => k + 1);
                update();
            });
        },
        next,
    }));
    const containerRef = React.createRef<HTMLDivElement>();
    const mainContentRef = React.createRef<HTMLDivElement>();
    const [ready, setReady] = useState(false);
    const readyHandlerExecuted = React.useRef(false);
    const currentHandlingResult = React.useRef<CalledActionResult | Awaitable<CalledActionResult> | null>(null);
    const nextMultiLock = React.useRef<MultiLock | null>(null);

    const { preloaded } = usePreloaded();
    const [preloadedReady, setPreloadedReady] = useState(false);
    const [awaitables] = useState<Map<Awaitable<CalledActionResult>, EventToken>>(new Map());

    function next() {
        const cleanup = () => {
            awaitables.forEach((value) => value.cancel());
        };

        if (state.rollLock.isLocked()) {
            return;
        }

        cleanup();

        let exited = false, count = 0;
        while (!exited) {
            if (count++ > game.config.maxStackModelLoop) {
                throw new RuntimeGameError("Max stack model loop reached");
            }

            const nextResult = game.getLiveGame().next();
            if (!nextResult) {
                if (game.getLiveGame().stackModel?.isEmpty()) {
                    break;
                }
                continue;
            }

            // Handle Awaitable
            if (Awaitable.isAwaitable<CalledActionResult>(nextResult)) {
                if (currentHandlingResult.current === nextResult) {
                    break;
                }
                currentHandlingResult.current = nextResult;
                nextResult.onSettled(() => {
                    if (currentHandlingResult.current === nextResult) {
                        currentHandlingResult.current = null;
                    }
                    next();
                });
                exited = true;
                break;
            }

            // Handle MultiLock
            if (nextResult instanceof MultiLock) {
                if (nextMultiLock.current === nextResult) {
                    break;
                }
                nextMultiLock.current = nextResult;
                nextResult.nextUnlock().then(() => {
                    if (nextMultiLock.current === nextResult) {
                        nextMultiLock.current = null;
                    }
                    next();
                });
                exited = true;
                break;
            }

            // Handle CalledActionResult 
            if (StackModel.isCalledActionResult(nextResult)) {
                if (nextResult.wait && StackModel.isStackModelsAwaiting(nextResult.wait.type, nextResult.wait.stackModels)) {
                    if (currentHandlingResult.current === nextResult) {
                        break;
                    }
                    currentHandlingResult.current = nextResult;

                    if (nextResult.wait) {
                        StackModel.executeStackModelGroup(nextResult.wait.type, nextResult.wait.stackModels).then(() => {
                            if (currentHandlingResult.current === nextResult) {
                                currentHandlingResult.current = null;
                            }
    
                            next();
                        });
                    }

                    exited = true;
                    break;
                }
            }

            // Handle regular action result
            state.handle(nextResult);
        }
        state.stage.update();
    }

    useEffect(() => {
        game.getLiveGame().setGameState(state);
        if (story && !game.getLiveGame().isPlaying()) {
            game.getLiveGame().loadStory(story);
        }
        state.playerCurrent = containerRef.current;
        state.mainContentNode = mainContentRef.current;

        return () => {
            game.getLiveGame().setGameState(undefined);
            state.playerCurrent = null;
        };
    }, [game, story]);

    useEffect(() => {
        return createMicroTask(() => {
            setReady(true);

            const lastScene = state.getLastScene();

            const events: (() => void)[] = [];
            if (lastScene) {
                events.push(lastScene.events.once("event:scene.mount", () => {
                    state.stage.next();
                }).cancel);
            } else {
                state.stage.next();
            }

            const gameStateEvents = state.events.on(GameState.EventTypes["event:state.end"], () => {
                if (onEnd) {
                    onEnd({
                        game,
                        gameState: state,
                        liveGame: game.getLiveGame(),
                        storable: game.getLiveGame().getStorable(),
                    });
                }
            });

            state.stage.update();

            return () => {
                if (lastScene) {
                    events.forEach(token => token());
                }
                gameStateEvents.cancel();
            };
        });
    }, []);

    useEffect(() => {
        return createMicroTask(() => {
            if (ready && onReady && !readyHandlerExecuted.current) {
                readyHandlerExecuted.current = true;
                state.stage.forceUpdate();

                game.hooks.trigger("init", []);
                onReady({
                    game,
                    gameState: state,
                    liveGame: game.getLiveGame(),
                    storable: game.getLiveGame().getStorable(),
                });
            }
        });
    }, [ready]);

    useEffect(() => {
        return preloaded.events.depends([
            preloaded.events.on(Preloaded.EventTypes["event:preloaded.ready"], () => {
                setPreloadedReady(true);
                state.stage.update();
                if (story) {
                    next();
                }
            }),
        ]).cancel;
    }, []);

    useEffect(() => {
        state.flushDep = flushDep;
    }, [flushDep]);

    const playerWidth = width || game.config.width;
    const playerHeight = height || game.config.height;

    return (
        <ErrorBoundary>
            <div
                style={{
                    width: typeof playerWidth === "number" ? `${playerWidth}px` : playerWidth,
                    height: typeof playerHeight === "number" ? `${playerHeight}px` : playerHeight,
                }}
                className={clsx(className, "__narraleaf_content-player")}
                ref={containerRef}
                tabIndex={0}
            >
                <AspectRatio className={clsx("flex-grow overflow-auto")} gameState={state}>
                    <SizeUpdateAnnouncer ref={containerRef} />
                    <PreferenceUpdateAnnouncer gameState={state} />
                    <RenderEventAnnoucer gameState={state} />
                    <Isolated className={"absolute"} ref={mainContentRef} style={{
                        cursor: state.game.config.cursor ? "none" : "auto",
                        overflow: state.game.config.showOverflow ? "visible" : "hidden",
                    }}>
                        {game.config.cursor && (
                            <Cursor
                                src={game.config.cursor}
                                width={game.config.cursorWidth}
                                height={game.config.cursorHeight}
                            />
                        )}
                        <OnlyPreloaded show={preloadedReady && active} key={key}>
                            <KeyEventAnnouncer state={state} />
                            {state.getSceneElements().map((elements) => (
                                <StageScene key={"scene-" + elements.scene.getId()} state={state} elements={elements} />
                            ))}
                            {state.getVideos().map((video, index) => (
                                <div className={"w-full h-full absolute"} key={"video-" + index} data-element-type={"video"}>
                                    <Video gameState={state} video={video} />
                                </div>
                            ))}
                        </OnlyPreloaded>
                        <Preload state={state} />
                        <RootLayout>
                            {children}
                        </RootLayout>
                    </Isolated>
                </AspectRatio>
            </div>
        </ErrorBoundary>
    );
}

function OnlyPreloaded({ children, show }: Readonly<{
    children: React.ReactNode,
    show: boolean,
}>) {
    return (
        <>
            {show ? children : null}
        </>
    );
}
