import React from "react";
import {GameState} from "@player/gameState";
import {Video as GameVideo} from "@core/elements/video";
import {useEffect, useRef} from "react";
import {ExposedStateType} from "@player/type";
import {RuntimeGameError} from "@core/common/Utils";
import {useElementVisibility} from "@player/lib/useElementVisibility";

/**@internal */
export default function Video(
    {gameState, video}: {
        gameState: GameState;
        video: GameVideo;
    }
) {
    const ref = useRef<HTMLVideoElement>(null);
    const {show, hide} = useElementVisibility<HTMLVideoElement>(ref);

    useEffect(() => {
        return gameState.events.depends([
            gameState.events.on(GameState.EventTypes["event:state.player.skip"], () => {
                if (gameState.game.config.allowSkipVideo) {
                    skip();
                    gameState.logger.log("NarraLeaf-React: Video", "Skipped");
                }
            }),
        ]).cancel;
    }, []);

    useEffect(() => {
        hide();

        if (video.state.display) {
            show();
        }
    }, []);

    useEffect(() => {
        if (!ref.current) return;

        const videoElement = ref.current;
        let mounted = false;
        // Resolvers for every in-flight play() call. On unmount we settle them so an awaiting
        // play action can never hang after the element is gone (hide-during-play, scene change,
        // dispose, save/load restore, ...).
        const pendingPlays = new Set<() => void>();

        const invalidRef = () => new RuntimeGameError("Failed to add event listener, ref is not available\nat Video.tsx: useEffect");

        // Mount the exposed video state exactly once. `errored` means the source failed to load, so
        // there is nothing playable — play() then resolves immediately instead of waiting forever.
        const mountVideoState = (errored: boolean) => {
            if (mounted) return;
            mounted = true;

            gameState.mountState<ExposedStateType.video>(video, {
                show: () => {
                    if (!ref.current) throw invalidRef();
                    show();
                },
                hide: () => {
                    if (!ref.current) throw invalidRef();
                    hide();
                },
                play: () => {
                    if (!ref.current) throw invalidRef();

                    const el = ref.current;
                    if (errored || el.error) {
                        gameState.logger.error(
                            "NarraLeaf-React: Video",
                            "Cannot play a video whose source failed to load: " + video.config.src
                        );
                        return Promise.resolve();
                    }

                    el.currentTime = 0;
                    return new Promise<void>((resolve) => {
                        let settled = false;
                        let cancelSchedule: (() => void) | null = null;
                        const listenerCleanups: (() => void)[] = [];

                        // Single, idempotent exit path — resolves the action and tears every
                        // listener/timer down, whether we end via `ended`, `stopped`, a play()
                        // rejection, a playback `error`, or the component unmounting.
                        const settle = () => {
                            if (settled) return;
                            settled = true;
                            pendingPlays.delete(settle);
                            if (cancelSchedule) cancelSchedule();
                            listenerCleanups.forEach((cleanup) => cleanup());
                            resolve();
                        };
                        pendingPlays.add(settle);

                        cancelSchedule = gameState.schedule(({retry}) => {
                            if (settled) return;

                            if (el.readyState < 3) {
                                const onLoadedData = () => {
                                    el.removeEventListener("loadeddata", onLoadedData);
                                    retry();
                                };
                                el.addEventListener("loadeddata", onLoadedData);
                                listenerCleanups.push(() => el.removeEventListener("loadeddata", onLoadedData));
                                return;
                            }

                            const onEnded = () => settle();
                            const onStop = () => settle();
                            const onError = () => {
                                gameState.logger.error(
                                    "NarraLeaf-React: Video",
                                    "Video playback error: " + video.config.src
                                );
                                settle();
                            };

                            el.addEventListener("ended", onEnded);
                            el.addEventListener("stopped", onStop);
                            el.addEventListener("error", onError);
                            listenerCleanups.push(() => {
                                el.removeEventListener("ended", onEnded);
                                el.removeEventListener("stopped", onStop);
                                el.removeEventListener("error", onError);
                            });

                            el.play().catch((err) => {
                                gameState.logger.error("Failed to play video: " + err);
                                settle();
                            });
                        }, 10);
                    });
                },
                pause: () => {
                    if (!ref.current) throw invalidRef();
                    ref.current.pause();
                },
                resume: () => {
                    if (!ref.current) throw invalidRef();
                    return ref.current.play().catch((err) => {
                        gameState.logger.error("Failed to resume video: " + err);
                    });
                },
                stop: () => {
                    if (!ref.current) throw invalidRef();
                    ref.current.pause();
                    ref.current.dispatchEvent(new Event("stopped"));
                },
                seek: (time) => {
                    if (!ref.current) throw invalidRef();
                    ref.current.currentTime = time;
                },
            });
        };

        const onCanPlay = () => mountVideoState(false);
        const onError = () => {
            gameState.logger.error(
                "NarraLeaf-React: Video",
                `Failed to load video source: ${video.config.src}` +
                (videoElement.error ? ` (media error code ${videoElement.error.code})` : "")
            );
            // Mount a degraded state so show()/play() resolve and the story keeps advancing.
            mountVideoState(true);
        };

        videoElement.addEventListener("canplay", onCanPlay);
        videoElement.addEventListener("error", onError);

        // The media may already be ready or already failed before this effect ran (cached, blob:,
        // data: sources) — in which case neither `canplay` nor `error` will fire again. Reconcile
        // against the current readyState/error so we never miss the one-shot mount.
        if (videoElement.readyState >= 3) {
            mountVideoState(false);
        } else if (videoElement.error) {
            onError();
        }

        return () => {
            videoElement.removeEventListener("canplay", onCanPlay);
            videoElement.removeEventListener("error", onError);

            // Settle any in-flight play() so its awaiting action can't hang after unmount.
            pendingPlays.forEach((settle) => settle());

            if (videoElement.currentTime > 0) {
                videoElement.pause();
            }

            if (gameState.isStateMounted(video)) {
                gameState.unMountState(video);
            }
        };
    }, [gameState, video]);

    function skip() {
        if (ref.current) {
            ref.current.pause();
            ref.current.currentTime = 0;
            ref.current.dispatchEvent(new Event("stopped"));
        }
    }

    return (
        <video
            ref={ref}
            src={video.config.src}
            preload={"auto"}
            muted={video.config.muted}
            playsInline
            width={"100%"}
            height={"100%"}
            onContextMenu={(e) => e.preventDefault()}
        />
    );
}
