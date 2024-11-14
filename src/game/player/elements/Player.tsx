import "client-only";
import "@player/lib/styles/style.css";

import clsx from "clsx";
import React, {useEffect, useReducer, useState} from "react";
import {Awaitable, MultiLock} from "@lib/util/data";
import {CalledActionResult} from "@core/gameTypes";
import {SceneEventTypes} from "@core/elements/scene";

import Motion from "@player/lib/Motion";
import AspectRatio from "@player/lib/AspectRatio";
import Isolated from "@player/lib/isolated";
import {default as StageScene} from "@player/elements/scene/Scene";
import {usePreloaded} from "@player/provider/preloaded";
import {Preload} from "@player/elements/preload/Preload";
import {Preloaded} from "@player/lib/Preloaded";
import {GameState, PlayerAction} from "@player/gameState";
import {useGame} from "@player/provider/game-state";
import {PlayerProps} from "@player/elements/type";
import {KeyEventAnnouncer} from "@player/elements/player/KeyEventAnnouncer";
import {flushSync} from "react-dom";
import Displayables from "@player/elements/displayable/Displayables";
import {ErrorBoundary} from "@player/lib/ErrorBoundary";
import SizeUpdateAnnouncer from "@player/elements/player/SizeUpdateAnnouncer";

function handleAction(state: GameState, action: PlayerAction) {
    return state.handle(action);
}

export default function Player(
    {
        story,
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
            (state as GameState).logger.warn("Player", "force update");
            flushSync(() => {
                update();
            });
        },
        next,
        dispatch: (action) => dispatch(action),
    }));
    const containerRef = React.createRef<HTMLDivElement>();

    const Say = game.config.elements.say.use;
    const Menu = game.config.elements.menu.use;

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
        game.getLiveGame().setGameState(state).loadStory(story);

        return () => {
            game.getLiveGame().setGameState(undefined);
        };
    }, [game]);

    useEffect(() => {
        let microTaskExecuted = false;

        const microTask = Promise.resolve().then(() => {
            microTaskExecuted = true;

            if (onReady) {
                onReady({
                    game,
                    gameState: state,
                    liveGame: game.getLiveGame(),
                    storable: game.getLiveGame().getStorable(),
                });
            }

            const lastScene = state.getLastScene();

            const events: {
                type: keyof SceneEventTypes;
                listener: () => void;
            }[] = [];
            if (lastScene) {
                events.push({
                    type: "event:scene.mount",
                    listener: lastScene.events.once("event:scene.mount", () => {
                        state.stage.next();
                    })
                });
            } else {
                state.stage.next();
            }

            const gameStateEvents = state.events.onEvents([
                {
                    type: GameState.EventTypes["event:state.end"],
                    listener: () => {
                        if (onEnd) {
                            onEnd({
                                game,
                                gameState: state,
                                liveGame: game.getLiveGame(),
                                storable: game.getLiveGame().getStorable(),
                            });
                        }
                    }
                }
            ]);

            const gameKeyEvents = state.events.onEvents([
                {
                    type: GameState.EventTypes["event:state.player.skip"],
                    listener: () => {
                        game.getLiveGame().abortAwaiting();
                        next();
                    }
                }
            ]);

            state.stage.update();

            return () => {
                if (lastScene) {
                    events.forEach(event => {
                        lastScene.events.off(event.type, event.listener);
                    });
                }
                gameStateEvents.cancel();
                gameKeyEvents.cancel();
            };
        });

        return () => {
            if (microTaskExecuted) {
                microTask.then(cancelListeners => cancelListeners());
            }
        };
    }, []);

    state.events.emit(GameState.EventTypes["event:state.player.flush"]);

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
            <Motion>
                <div style={{
                    width: typeof playerWidth === "number" ? `${playerWidth}px` : playerWidth,
                    height: typeof playerHeight === "number" ? `${playerHeight}px` : playerHeight,
                }} className={clsx(className, "__narraleaf_content-player")} ref={containerRef}>
                    <AspectRatio className={clsx("flex-grow overflow-auto")}>
                        <SizeUpdateAnnouncer containerRef={containerRef}/>
                        <Isolated>
                            <Preload state={state}/>
                            <OnlyPreloaded onLoaded={handlePreloadLoaded} state={state}>
                                <KeyEventAnnouncer state={state}/>
                                {
                                    state.getSceneElements().map(({scene, ele}) => (
                                        <StageScene key={"scene-" + scene.getId()} state={state} scene={scene}>
                                            <Displayables state={state} displayable={ele.displayable}/>
                                            {
                                                ele.texts.map(({action, onClick}) => {
                                                    return (
                                                        <Say
                                                            state={state}
                                                            key={"say-" + action.id}
                                                            action={action}
                                                            onClick={() => {
                                                                onClick();
                                                                next();
                                                            }}
                                                        />
                                                    );
                                                })
                                            }
                                            {
                                                ele.menus.map((action, i) => {
                                                    return (
                                                        <div key={"menu-" + i}>
                                                            {
                                                                <Menu
                                                                    state={state}
                                                                    prompt={action.action.prompt}
                                                                    choices={action.action.choices}
                                                                    afterChoose={(choice) => {
                                                                        action.onClick(choice);
                                                                        next();
                                                                    }}
                                                                />
                                                            }
                                                        </div>
                                                    );
                                                })
                                            }
                                        </StageScene>
                                    ))
                                }
                            </OnlyPreloaded>
                            {children}
                        </Isolated>
                    </AspectRatio>
                </div>
            </Motion>
        </ErrorBoundary>
    );
}

function OnlyPreloaded({children, onLoaded, state}: Readonly<{
    children: React.ReactNode,
    onLoaded: () => void,
    state: GameState
}>) {
    const {preloaded} = usePreloaded();
    const [preloadedReady, setPreloadedReady] = useState(false);

    useEffect(() => {
        const listener = preloaded.events.on(Preloaded.EventTypes["event:preloaded.ready"], () => {
            setPreloadedReady(true);
            onLoaded();
        });
        const unmountListener = state.events.on(GameState.EventTypes["event:state.preload.unmount"], () => {
            setPreloadedReady(false);
        });
        return () => {
            preloaded.events.off(Preloaded.EventTypes["event:preloaded.ready"], listener);
            state.events.off(GameState.EventTypes["event:state.preload.unmount"], unmountListener);
        };
    }, [preloadedReady]);

    return (
        <>
            {preloadedReady ? children : null}
        </>
    );
}
