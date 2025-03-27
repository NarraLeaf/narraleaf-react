import "client-only";
import "@player/lib/styles/style.css";

import clsx from "clsx";
import {flushSync} from "react-dom";
import Cursor from "@player/lib/Cursor";
import {Story} from "@core/elements/story";
import Isolated from "@player/lib/isolated";
import {Preloaded} from "@player/lib/Preloaded";
import AspectRatio from "@player/lib/AspectRatio";
import {PlayerProps} from "@player/elements/type";
import {CalledActionResult} from "@core/gameTypes";
import {useGame} from "@player/provider/game-state";
import {ErrorBoundary} from "@player/lib/ErrorBoundary";
import {usePreloaded} from "@player/provider/preloaded";
import {Preload} from "@player/elements/preload/Preload";
import {GameState, PlayerAction} from "@player/gameState";
import React, {useEffect, useReducer, useState} from "react";
import {PageRouter} from "@player/lib/PageRouter/PageRouter";
import {default as StageScene} from "@player/elements/scene/Scene";
import {Awaitable, createMicroTask, MultiLock} from "@lib/util/data";
import {KeyEventAnnouncer} from "@player/elements/player/KeyEventAnnouncer";
import SizeUpdateAnnouncer from "@player/elements/player/SizeUpdateAnnouncer";

function handleAction(state: GameState, action: PlayerAction) {
    return state.handle(action);
}

export default function Player(
    {
        story = Story.empty(),
        width,
        height,
        className,
        onReady,
        onEnd,
        children,
    }: Readonly<PlayerProps>) {
    const [, update] = useReducer((x) => x + 1, 0);
    const {game} = useGame();
    const [state, dispatch] = useReducer(handleAction, new GameState(game, {
        update,
        forceUpdate: () => {
            (state as GameState).logger.weakWarn("Player", "force update");
            flushSync(() => {
                update();
            });
        },
        next,
        dispatch: (action) => dispatch(action),
    }));
    const containerRef = React.createRef<HTMLDivElement>();
    const mainContentRef = React.createRef<HTMLDivElement>();
    const [ready, setReady] = useState(false);
    const readyHandlerExecuted = React.useRef(false);

    function next() {
        let exited = false;
        while (!exited) {
            const nextResult = game.getLiveGame().next(state);
            if (!nextResult) {
                break;
            }
            if (Awaitable.isAwaitable<CalledActionResult>(nextResult)) {
                exited = true;
                break;
            }
            if (nextResult instanceof MultiLock) {
                nextResult.nextUnlock().then(() => {
                    next();
                });
                exited = true;
                break;
            }
            dispatch(nextResult);
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
                onReady({
                    game,
                    gameState: state,
                    liveGame: game.getLiveGame(),
                    storable: game.getLiveGame().getStorable(),
                });
            }
        });
    }, [ready]);

    function handlePreloadLoaded() {
        state.stage.update();
        if (story) {
            next();
        }
    }

    const playerWidth = width || game.config.player.width;
    const playerHeight = height || game.config.player.height;

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
                    <Isolated className={"absolute"} ref={mainContentRef} style={{
                        cursor: state.game.config.player.cursor ? "none" : "auto",
                        overflow: state.game.config.player.showOverflow ? "visible" : "hidden",
                    }}>
                        {game.config.player.cursor && (
                            <Cursor
                                src={game.config.player.cursor}
                                width={game.config.player.cursorWidth}
                                height={game.config.player.cursorHeight}
                            />
                        )}
                        <OnlyPreloaded onLoaded={handlePreloadLoaded} state={state}>
                            <KeyEventAnnouncer state={state}/>
                            {state.getSceneElements().map((elements) => (
                                <StageScene key={"scene-" + elements.scene.getId()} state={state} elements={elements}/>
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

function OnlyPreloaded({children, onLoaded}: Readonly<{
    children: React.ReactNode,
    onLoaded: () => void,
    state: GameState
}>) {
    const {preloaded} = usePreloaded();
    const [preloadedReady, setPreloadedReady] = useState(false);

    useEffect(() => {
        return preloaded.events.depends([
            preloaded.events.on(Preloaded.EventTypes["event:preloaded.ready"], () => {
                setPreloadedReady(true);
                onLoaded();
            }),
        ]).cancel;
    }, []);

    return (
        <>
            {preloadedReady ? children : null}
        </>
    );
}
