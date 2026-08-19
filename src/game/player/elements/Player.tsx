import "client-only";

import { Story } from "@core/elements/story";
import type { Scene as CoreScene } from "@core/elements/scene";
import type { GameLifecycleEventContext } from "@core/game";
import { CalledActionResult } from "@core/gameTypes";
import { Awaitable, createMicroTask, EventToken, MultiLock } from "@lib/util/data";
import { KeyEventAnnouncer } from "@player/elements/player/KeyEventAnnouncer";
import { StageClickAnnouncer } from "@player/elements/player/StageClickAnnouncer";
import PreferenceUpdateAnnouncer from "@player/elements/player/PreferenceUpdateAnnouncer";
import { Preload } from "@player/elements/preload/Preload";
import { default as StageScene } from "@player/elements/scene/Scene";
import { default as SceneDialogs } from "@player/elements/scene/SceneDialogs";
import { Camera as StageCamera } from "@player/elements/player/Camera";
import { PlayerProps } from "@player/elements/type";
import Video from "@player/elements/video/video";
import Vfx from "@player/elements/vfx/Vfx";
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
import PlayerNotification from "./notification/PlayerNotification";
import { NvlProvider, useNvl } from "./nvl/NvlContext";
import { NvlDialogComponent } from "./type";
import { Script } from "@core/elements/script";

export default function Player(
    {
        story = Story.empty(),
        width,
        height,
        className,
        onReady,
        onPreloadComplete,
        onPreloadedReady,
        onFirstSceneReady,
        onEnd,
        onError,
        children,
        active = true,
    }: Readonly<PlayerProps>) {
    const [flushDep, update] = useReducer((x) => x + 1, 0);
    const [firstSceneMountDep, updateFirstSceneMount] = useReducer((x) => x + 1, 0);
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
    const preloadedReadyHandlerExecuted = React.useRef(false);
    const [preloadComplete, setPreloadComplete] = useState(false);
    const preloadCompleteHandlerExecuted = React.useRef(false);
    const firstSceneRef = React.useRef<CoreScene | null>(null);
    const firstSceneReadyPending = React.useRef(false);
    const [awaitables] = useState<Map<Awaitable<CalledActionResult>, EventToken>>(new Map());

    function getLifecycleContext(scene: CoreScene | null): GameLifecycleEventContext {
        return {
            game,
            gameState: state,
            liveGame: game.getLiveGame(),
            storable: game.getLiveGame().getStorable(),
            scene,
        };
    }

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
                if (game.getLiveGame().stackModel && !game.getLiveGame().stackModel!.isEmpty()) {
                    continue;
                }
                break;
            }

            // Handle Awaitable
            if (Awaitable.isAwaitable<CalledActionResult>(nextResult)) {
                if (currentHandlingResult.current === nextResult) {
                    break;
                }
                currentHandlingResult.current = nextResult;
                nextResult.onSettled(() => {
                    if (nextResult.isFailed()) {
                        return;
                    }
                    if (currentHandlingResult.current === nextResult) {
                        currentHandlingResult.current = null;
                    }
                    next();
                });
                nextResult.onFailed((error) => {
                    if (currentHandlingResult.current === nextResult) {
                        currentHandlingResult.current = null;
                    }
                    state.logger.error("Player", error);
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
                        const waitResult = StackModel.executeStackModelGroup(nextResult.wait.type, nextResult.wait.stackModels);
                        waitResult.then(() => {
                            if (currentHandlingResult.current === nextResult) {
                                currentHandlingResult.current = null;
                            }

                            next();
                        });
                        waitResult.onFailed((error) => {
                            if (currentHandlingResult.current === nextResult) {
                                currentHandlingResult.current = null;
                            }
                            state.logger.error("Player", error);
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
        state.audioManager.initialize();
    }, []);

    useEffect(() => {
        game.getLiveGame().setGameState(state);
        if (story && !game.getLiveGame().isPlaying()) {
            game.getLiveGame().loadStory(story);
        }
        // Warm the entry scene the moment the story is known, without entering it. Hosts that show
        // a main menu (or any UI) before calling `newGame()` used to give the preloader nothing to
        // work with — it needs a scene, and there is none until the game is entered — so the whole
        // fetch/encode/decode pass landed between "start" and the first frame. Registering the
        // entry scene as the preloading scene moves that work behind whatever the player is already
        // looking at. `loadStory` above has already built the scene's src manager.
        if (story?.entryScene && !state.getPreloadingScene() && !state.getLastScene()) {
            state.preloadScene(story.entryScene);
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
        return createMicroTask(() => {
            if (preloadedReady && onPreloadedReady && !preloadedReadyHandlerExecuted.current) {
                preloadedReadyHandlerExecuted.current = true;
                const scene = firstSceneRef.current || state.getLastScene() || state.getPreloadingScene();
                const ctx = getLifecycleContext(scene);
                onPreloadedReady(ctx);
            }
        });
    }, [preloadedReady]);

    useEffect(() => {
        return createMicroTask(() => {
            if (preloadComplete && !preloadCompleteHandlerExecuted.current) {
                preloadCompleteHandlerExecuted.current = true;
                const scene = firstSceneRef.current || state.getLastScene() || state.getPreloadingScene();
                const ctx = getLifecycleContext(scene);

                if (game.markPreloadComplete(ctx) && onPreloadComplete) {
                    onPreloadComplete(ctx);
                }
            }
        });
    }, [preloadComplete]);

    useEffect(() => {
        return state.events.on(GameState.EventTypes["event:state.scene.mount"], (scene) => {
            if (firstSceneRef.current) {
                return;
            }
            firstSceneRef.current = scene;
            updateFirstSceneMount();
        }).cancel;
    }, []);

    useEffect(() => {
        if (!preloadComplete || !active || firstSceneReadyPending.current || game.isFirstSceneReady()) {
            return;
        }

        const scene = firstSceneRef.current || state.getLastScene();
        if (!scene) {
            return;
        }

        let frame: number | null = null;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let completed = false;
        firstSceneReadyPending.current = true;

        const complete = () => {
            completed = true;
            firstSceneReadyPending.current = false;

            const ctx = getLifecycleContext(scene);
            if (game.markFirstSceneReady(ctx) && onFirstSceneReady) {
                onFirstSceneReady(ctx);
            }
        };

        if (typeof requestAnimationFrame === "function") {
            frame = requestAnimationFrame(() => {
                timer = setTimeout(complete, 0);
            });
        } else {
            timer = setTimeout(complete, 0);
        }

        return () => {
            if (completed) {
                return;
            }
            firstSceneReadyPending.current = false;
            if (frame !== null && typeof cancelAnimationFrame === "function") {
                cancelAnimationFrame(frame);
            }
            if (timer !== null) {
                clearTimeout(timer);
            }
        };
    }, [active, firstSceneMountDep, flushDep, preloadComplete]);

    useEffect(() => {
        return preloaded.events.depends([
            preloaded.events.on(Preloaded.EventTypes["event:preloaded.ready"], () => {
                setPreloadedReady(true);
                state.stage.update();
                if (story && game.getLiveGame().isPlaying()) {
                    next();
                }
            }),
            preloaded.events.on(Preloaded.EventTypes["event:preloaded.complete"], () => {
                setPreloadComplete(true);
            }),
        ]).cancel;
    }, []);

    useEffect(() => {
        state.flushDep = flushDep;
    }, [flushDep]);

    const playerWidth = width || game.config.width;
    const playerHeight = height || game.config.height;

    return (
        <ErrorBoundary onError={onError}>
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
                    <PreferenceUpdateAnnouncer gameState={state} />
                    <RenderEventAnnoucer gameState={state} />
                    <Isolated className={"absolute"} ref={mainContentRef} style={{
                        cursor: state.game.config.cursor ? "none" : "auto",
                        overflow: state.game.config.showOverflow ? "visible" : "hidden",
                        // Contain mix-blend-mode compositing (Vfx overlays) inside the stage:
                        // without an isolated stacking context, blended pixels over transparent
                        // stage areas would mix with the host page background.
                        isolation: "isolate",
                    }}>
                        {game.config.cursor && (
                            <Cursor
                                src={game.config.cursor}
                                width={game.config.cursorWidth}
                                height={game.config.cursorHeight}
                            />
                        )}
                        <OnlyPreloaded show={preloadedReady && active} key={key}>
                            <NvlProvider>
                                <KeyEventAnnouncer state={state} />
                                <StageClickAnnouncer state={state} />
                                <StageCameraBoundary state={state}>
                                    {/* `isolation: isolate` is what keeps a stage transition's stacking order to
                                        itself. The transition raises the incoming scene above the outgoing one with
                                        a z-index, and without a stacking context of their own those z-indexes
                                        compete with the videos and vfx below — which sit at `auto` and `0` — so a
                                        vignette or a blink running across a jump would be covered by the incoming
                                        scene for the whole length of it. Isolated, the scenes order among
                                        themselves and the group as a whole keeps its document-order place. */}
                                    <div className={"w-full h-full absolute"} style={{isolation: "isolate"}} data-element-type={"scene-group"}>
                                        {state.getSceneElements().map((elements) => (
                                            <StageScene key={"scene-" + elements.scene.getId()} state={state} elements={elements} />
                                        ))}
                                    </div>
                                    <StageTransitionOverlayHost state={state} />
                                    {state.getVideos().map((video, index) => (
                                        <div className={"w-full h-full absolute"} key={"video-" + index} data-element-type={"video"}>
                                            <Video gameState={state} video={video} />
                                        </div>
                                    ))}
                                    {state.getVfx().map((vfx) => (
                                        <div
                                            className={"w-full h-full absolute"}
                                            key={"vfx-" + vfx.getId()}
                                            data-element-type={"vfx"}
                                            // The blend belongs HERE and not on the <video> inside. A
                                            // positioned element with a numeric z-index is a stacking
                                            // context, so a `mix-blend-mode` applied within this div
                                            // blends against this div's own (empty) backdrop and never
                                            // reaches the stage — `screen` then renders as `normal`,
                                            // which for a glow-on-black clip is an opaque black
                                            // rectangle over the whole scene. Applied to the wrapper,
                                            // the group blends against what is painted beneath it
                                            // inside the stage's isolated context, which is the scene.
                                            style={{zIndex: vfx.config.zIndex, mixBlendMode: vfx.config.blendMode}}
                                        >
                                            <Vfx gameState={state} vfx={vfx} />
                                        </div>
                                    ))}
                                </StageCameraBoundary>
                                {state.getSceneElements().map((elements) => (
                                    <SceneDialogs key={"scene-dialogs-" + elements.scene.getId()} state={state} elements={elements} />
                                ))}
                                <NvlOverlay NvlComponent={game.config.nvlDialog} />
                            </NvlProvider>
                        </OnlyPreloaded>
                        <Preload state={state} />
                        <RootLayout>
                            {children}
                        </RootLayout>
                        <PlayerNotification gameState={state} />
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

/**
 * Wraps the whole visual stage in the story's {@link StageCamera} so camera transforms move every
 * scene and video as one unit. Falls back to rendering the stage unwrapped when no story is loaded
 * yet (there is no camera to bind to). The dialog/menu UI is rendered by the caller outside this
 * boundary and is deliberately unaffected by the camera.
 */
function StageCameraBoundary({ state, children }: Readonly<{
    state: GameState;
    children: React.ReactNode;
}>) {
    const camera = state.getLiveGame().story?.camera ?? null;
    if (!camera) {
        return <>{children}</>;
    }
    return (
        <StageCamera state={state} camera={camera}>
            {children}
        </StageCamera>
    );
}

/**
 * The node a stage transition creates its overlay elements inside — today only
 * {@link ThroughColor}'s colour plate.
 *
 * Rendered once, empty, directly above the scenes: the driver appends and removes its children
 * imperatively, so a transition never has to wait for a React commit to get an element it needs
 * on the very frame it starts.
 *
 * Outside the isolated scene group, and above the videos and vfx rather than below them. The
 * scenes take no part in each other's business and stay in their own stacking context; a colour
 * plate is the opposite — a full-screen hold whose whole job is to obscure the stage while the
 * scenes swap behind it, so it covers everything the camera holds.
 */
function StageTransitionOverlayHost({ state }: Readonly<{ state: GameState }>) {
    const hostRef = React.useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        state.stageTransition.registerOverlayHost(hostRef.current);

        return () => {
            state.stageTransition.registerOverlayHost(null);
        };
    }, []);

    return (
        <div
            className={"w-full h-full absolute pointer-events-none"}
            ref={hostRef}
            data-element-type={"stage-transition-overlay-host"}
        />
    );
}

function NvlOverlay({ NvlComponent }: { NvlComponent: NvlDialogComponent }) {
    const { dialogs, state } = useNvl();
    const game = useGame();
    const gameState = game.getLiveGame().getGameState()!;
    const dialogProxies = React.useMemo(() => (
        dialogs.map((entry, index) => {
            const words = entry.sentence.evaluate(Script.getCtx({ gameState }));
            const isActive = state.activeDialogId === entry.id;
            const useTypeEffect = isActive && state.phase === "typing";
            return {
                entry,
                index,
                isActive,
                gameState,
                words,
                useTypeEffect,
            };
        })
    ), [dialogs, gameState, state.activeDialogId, state.phase]);

    return <NvlComponent dialogs={dialogProxies} />;
}
