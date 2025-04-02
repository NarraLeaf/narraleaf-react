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
                if (gameState.game.config.elements.video.allowSkip) {
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
        let isMounted = false;

        const invalidRef = () => new RuntimeGameError("Failed to add event listener, ref is not available\nat Video.tsx: useEffect");

        const onCanPlay = () => {
            if (isMounted || !videoElement) return;
            isMounted = true;

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
                    const videoElement = ref.current;
                    return new Promise<void>((resolve) => {
                        const onEnded = () => {
                            cleanup();
                            resolve();
                        };

                        const onStop = () => {
                            cleanup();
                            resolve();
                        };

                        const cleanup = () => {
                            videoElement.removeEventListener("ended", onEnded);
                            videoElement.removeEventListener("stopped", onStop);
                        };

                        videoElement.addEventListener("ended", onEnded);
                        videoElement.addEventListener("stopped", onStop);
                        cleanups.push(cleanup);

                        videoElement.currentTime = 0;
                        videoElement.play().catch((err) => {
                            gameState.logger.error("Failed to play video: " + err);
                            cleanup();
                            resolve();
                        });
                    });
                },
                pause: () => {
                    if (!ref.current) throw invalidRef();
                    ref.current.pause();
                },
                resume: () => {
                    if (!ref.current) throw invalidRef();
                    return ref.current.play();
                },
                stop: () => {
                    if (!ref.current) throw invalidRef();
                    ref.current.pause();
                    ref.current.currentTime = 0;
                    ref.current.dispatchEvent(new Event("stopped"));
                },
                seek: (time) => {
                    if (!ref.current) throw invalidRef();
                    ref.current.currentTime = time;
                },
            });
        };

        const cleanups: (() => void)[] = [];
        videoElement.addEventListener("canplay", onCanPlay);

        return () => {
            videoElement.removeEventListener("canplay", onCanPlay);
            cleanups.forEach((cleanup) => cleanup());

            if (videoElement.src.startsWith("blob:") && URL.revokeObjectURL) {
                URL.revokeObjectURL(videoElement.src);
            }

            if (videoElement.currentTime > 0) {
                videoElement.pause();
                videoElement.currentTime = 0;
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
