import React, {useEffect, useMemo, useReducer, useState} from "react";
import {cloneDeep} from "lodash";
import {useGame} from "@player/provider/game-state";
import {Awaitable} from "@lib/util/data";
import {GameState, PlayerAction} from "@player/gameState";
import {Story} from "@core/elements/story";
import {CalledActionResult} from "@core/gameTypes";
import {SceneEventTypes} from "@core/elements/scene";

import Say from "@player/elements/say/Say";
import Menu from "@player/elements/menu/Menu";
import {default as StageScene} from "@player/elements/scene/Scene";
import {default as StageImage} from "@player/elements/image/Image";
import {usePreloaded} from "@player/provider/preloaded";
import {Preload} from "@player/elements/preload/Preload";
import {Preloaded} from "@player/lib/Preloaded";

function handleAction(state: GameState, action: PlayerAction) {
    return state.handle(action);
}

export default function Player({
                                   story
                               }: Readonly<{
    story: Story;
}>) {
    const [, forceUpdate] = useReducer((x) => x + 1, 0);
    const {game} = useGame();
    const [state, dispatch] = useReducer(handleAction, new GameState(game, {
        forceUpdate: () => {
            forceUpdate();
        },
        next,
        dispatch: (action) => dispatch(action),
    }));
    const _story = useMemo(() => {
        return cloneDeep(story);
    }, [story]);

    function next() {
        console.time("Next"); // @debug

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

        console.timeEnd("Next");
    }

    useEffect(() => {
        game.getLiveGame().loadStory(_story);
        game.getLiveGame().newGame();

        console.debug("Loaded game", game.getLiveGame().currentSavedGame);
        console.debug(state);

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

        state.stage.forceUpdate();

        return () => {
            if (lastScene) {
                events.forEach(event => {
                    lastScene.events.off(event.type, event.listener);
                });
            }
        };
    }, []);

    function handlePreloadLoaded() {
        state.stage.forceUpdate();
        next();
    }

    return (
        <>
            {
                state.state.srcManagers.map((srcManager, i) => {
                    return (
                        <Preload key={i} state={state} srcManager={srcManager}/>
                    )
                })
            }
            <OnlyPreloaded onLoaded={handlePreloadLoaded}>
                {
                    state.getSceneElements().map(({scene, ele}) => {
                        return (
                            <StageScene key={"scene-" + scene.id} state={state} scene={scene}>
                                {
                                    (ele.images.map((image) => {
                                        return (
                                            <StageImage key={"image-" + image.id} image={image} state={state}/>
                                        )
                                    }))
                                }
                                {
                                    ele.texts.map(({action, onClick}) => {
                                        return (
                                            <Say key={"say-" + action.id} action={action} onClick={() => {
                                                onClick();
                                                next();
                                            }}/>
                                        )
                                    })
                                }
                                {
                                    ele.menus.map((action, i) => {
                                        return (
                                            <div key={"menu-" + i}>
                                                {
                                                    <Menu prompt={action.action.prompt}
                                                          choices={action.action.choices}
                                                          afterChoose={(choice) => {
                                                              action.onClick(choice);
                                                              next();
                                                          }}/>
                                                }
                                            </div>
                                        )
                                    })
                                }
                            </StageScene>
                        )
                    })
                }
            </OnlyPreloaded>
        </>
    )
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
        }
    }, [preloadedReady]);
    return (
        <>
            {preloadedReady ? children : null}
        </>
    )
}
