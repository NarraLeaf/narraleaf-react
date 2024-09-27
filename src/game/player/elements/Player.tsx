import "client-only";
import "@player/lib/styles/style.css";

import clsx from "clsx";
import React, {useEffect, useReducer, useState} from "react";
import {Awaitable} from "@lib/util/data";
import {CalledActionResult} from "@core/gameTypes";
import {SceneEventTypes} from "@core/elements/scene";

import Motion from "@player/lib/Motion";
import AspectRatio from "@player/lib/AspectRatio";
import Isolated from "@player/lib/isolated";
import {default as StageScene} from "@player/elements/scene/Scene";
import {default as StageImage} from "@player/elements/image/Image";
import {usePreloaded} from "@player/provider/preloaded";
import {Preload} from "@player/elements/preload/Preload";
import {Preloaded} from "@player/lib/Preloaded";
import {GameState, PlayerAction} from "@player/gameState";
import {useGame} from "@player/provider/game-state";
import {PlayerProps} from "@player/elements/type";
import {KeyEventAnnouncer} from "@player/elements/player/KeyEventAnnouncer";

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
    }: Readonly<PlayerProps>) {
    const [, forceUpdate] = useReducer((x) => x + 1, 0);
    const {game} = useGame();
    const [state, dispatch] = useReducer(handleAction, new GameState(game, {
        forceUpdate: () => {
            forceUpdate();
        },
        next,
        dispatch: (action) => dispatch(action),
    }));

    const Say = game.config.elements.say.use;
    const Menu = game.config.elements.menu.use;

    function next() {
        let exited = false;
        while (!exited) {
            const next = game.getLiveGame().next(state);
            if (!next) {
                break;
            }
            if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(next)) {
                exited = true;
                break;
            }
            dispatch(next);
        }
        state.stage.forceUpdate();
    }

    useEffect(() => {
        if (!story) {
            return;
        }

        game.getLiveGame().loadStory(story);
    }, [story, game]);

    useEffect(() => {
        if (onReady) {
            onReady({
                game,
                state,
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
                            state,
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

        state.stage.forceUpdate();

        return () => {
            if (lastScene) {
                events.forEach(event => {
                    lastScene.events.off(event.type, event.listener);
                });
            }
            gameStateEvents.cancel();
            gameKeyEvents.cancel();
        };
    }, []);

    function handlePreloadLoaded() {
        state.stage.forceUpdate();
        if (story) {
            next();
        }
    }

    const playerWidth = width || game.config.player.width;
    const playerHeight = height || game.config.player.height;

    return (
        <Motion>
            <div style={{
                width: typeof playerWidth === "number" ? `${playerWidth}px` : playerWidth,
                height: typeof playerHeight === "number" ? `${playerHeight}px` : playerHeight,
            }} className={clsx(className, "__narraleaf_content-player")}>
                <AspectRatio className={clsx("flex-grow overflow-auto")}>
                    <Isolated className="relative">
                        {
                            state.state.srcManagers.map((srcManager, i) => {
                                return (
                                    <Preload key={i} state={state} srcManager={srcManager}/>
                                );
                            })
                        }
                        <OnlyPreloaded onLoaded={handlePreloadLoaded}>
                            <KeyEventAnnouncer state={state}/>
                            {
                                state.getSceneElements().map(({scene, ele}) => (
                                    <StageScene key={"scene-" + scene.id} state={state} scene={scene}>
                                        {
                                            (ele.images.map((image) => {
                                                return (
                                                    <StageImage
                                                        key={"image-" + image.getId()}
                                                        image={image}
                                                        state={state}
                                                    />
                                                );
                                            }))
                                        }
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
                    </Isolated>
                </AspectRatio>
            </div>
        </Motion>
    );
}

function OnlyPreloaded({children, onLoaded}: Readonly<{ children: React.ReactNode, onLoaded: () => void }>) {
    const {preloaded} = usePreloaded();
    const [preloadedReady, setPreloadedReady] = useState(false);
    useEffect(() => {
        const listener = preloaded.events.on(Preloaded.EventTypes["event:preloaded.ready"], () => {
            setPreloadedReady(true);
            onLoaded();
        });
        return () => {
            preloaded.events.off(Preloaded.EventTypes["event:preloaded.ready"], listener);
        };
    }, [preloadedReady]);
    return (
        <>
            {preloadedReady ? children : null}
        </>
    );
}
