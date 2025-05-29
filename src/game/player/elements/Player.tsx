import "client-only";

import { Story } from "@core/elements/story";
import { CalledActionResult } from "@core/gameTypes";
import { StackModel } from "@lib/game/nlcore/action/stackModel";
import { Awaitable, createMicroTask, MultiLock } from "@lib/util/data";
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
import { PageRouter } from "@player/lib/PageRouter/PageRouter";
import { Preloaded } from "@player/lib/Preloaded";
import { useGame } from "@player/provider/game-state";
import { usePreloaded } from "@player/provider/preloaded";
import clsx from "clsx";
import React, { useEffect, useReducer, useState } from "react";
import { flushSync } from "react-dom";
import { RenderEventAnnoucer } from "./player/RenderEventAnnoucer";

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
    const nextAwaitable = React.useRef<Awaitable | null>(null);
    const nextMultiLock = React.useRef<MultiLock | null>(null);

    const {preloaded} = usePreloaded();
    const [preloadedReady, setPreloadedReady] = useState(false);

    function next() {
        let exited = false;
        while (!exited) {
            const nextResult = game.getLiveGame().next();
            if (!nextResult) {
                break;
            }

            // Handle Awaitable
            if (Awaitable.isAwaitable<CalledActionResult>(nextResult)) {
                if (nextAwaitable.current === nextResult) {
                    break;
                }
                nextAwaitable.current = nextResult;
                nextResult.onSettled(() => {
                    state.stage.next();
                    if (nextAwaitable.current === nextResult) {
                        nextAwaitable.current = null;
                    }
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
                    next();
                    if (nextMultiLock.current === nextResult) {
                        nextMultiLock.current = null;
                    }
                });
                exited = true;
                break;
            }

            // Handle StackModel
            if (StackModel.isStackModel(nextResult)) {
                handleStackModel(nextResult);
                exited = true;
                break;
            }

            // Handle regular action result
            state.handle(nextResult);
        }
        state.stage.update();
    }

    // Helper function to handle StackModel
    function handleStackModel(stackModel: StackModel) {
        let exited = false;
        while (!exited) {
            const res = stackModel.rollNext();
            if (!res) {
                break;
            }

            // Handle Awaitable in StackModel
            if (Awaitable.isAwaitable<CalledActionResult>(res)) {
                if (nextAwaitable.current === res) {
                    break;
                }
                nextAwaitable.current = res;
                res.onSettled(() => {
                    state.stage.next();
                    if (nextAwaitable.current === res) {
                        nextAwaitable.current = null;
                    }
                });
                exited = true;
                break;
            }

            // Handle nested StackModel
            if (StackModel.isStackModel(res)) {
                handleStackModel(res);
                exited = true;
                break;
            }

            // Handle regular action result in StackModel
            state.handle(res);
        }
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
                    <SizeUpdateAnnouncer ref={containerRef}/>
                    <PreferenceUpdateAnnouncer gameState={state}/>
                    <RenderEventAnnoucer gameState={state}/>
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
                            <KeyEventAnnouncer state={state}/>
                            {state.getSceneElements().map((elements) => (
                                <StageScene key={"scene-" + elements.scene.getId()} state={state} elements={elements}/>
                            ))}
                            {state.getVideos().map((video, index) => (
                                <div className={"w-full h-full absolute"} key={"video-" + index} data-element-type={"video"}>
                                    <Video gameState={state} video={video}/>
                                </div>
                            ))}
                        </OnlyPreloaded>
                        <Preload state={state}/>
                        <PageRouter>
                            {children}
                        </PageRouter>
                    </Isolated>
                </AspectRatio>
            </div>
        </ErrorBoundary>
    );
}

function OnlyPreloaded({children, show}: Readonly<{
    children: React.ReactNode,
    show: boolean,
}>) {
    return (
        <>
            {show ? children : null}
        </>
    );
}
