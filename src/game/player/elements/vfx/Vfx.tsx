import React, {useEffect, useRef} from "react";
import {GameState} from "@player/gameState";
import {Vfx as GameVfx, VfxFadeOptions} from "@core/elements/vfx";
import {ExposedStateType} from "@player/type";
import type {TransformDefinitions} from "@core/elements/transform/type";

/**
 * Named easings that have an exact CSS timing-function equivalent. Everything else
 * (custom functions, spring-like names) falls back to "ease" with a debug log — a
 * fade is cosmetic and must not depend on a JS animation loop (hidden tabs freeze rAF).
 */
const NAMED_EASINGS: Record<string, string> = {
    linear: "linear",
    easeIn: "cubic-bezier(0.42, 0, 1, 1)",
    easeOut: "cubic-bezier(0, 0, 0.58, 1)",
    easeInOut: "cubic-bezier(0.42, 0, 0.58, 1)",
};

/**@internal */
function toCssEasing(gameState: GameState, easing: TransformDefinitions.EasingDefinition | undefined): string {
    if (easing === undefined) {
        return "linear";
    }
    if (Array.isArray(easing)) {
        return `cubic-bezier(${easing.join(", ")})`;
    }
    if (typeof easing === "string" && NAMED_EASINGS[easing]) {
        return NAMED_EASINGS[easing];
    }
    gameState.logger.debug("NarraLeaf-React: Vfx", "Easing has no CSS equivalent, falling back to \"ease\"", easing);
    return "ease";
}

/**@internal */
export default function Vfx(
    {gameState, vfx}: {
        gameState: GameState;
        vfx: GameVfx;
    }
) {
    const ref = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        let errored = false;
        let stateMounted = false;
        /** Bumped on every fade; only the newest fade may write the element's final opacity. */
        let fadeGeneration = 0;
        /**
         * True once an exposed show()/hide() has taken control of visibility. A fresh
         * `vfx.show()` claims the element synchronously when the state below is mounted,
         * which is how the mount-time restore path knows it must not reveal on its own.
         */
        let claimed = false;
        /** In-flight show/hide operations; a player skip flips them to instant completion. */
        const inFlightOps = new Set<{ instant: boolean }>();
        /**
         * Settle callbacks for every pending wait (first-frame gates and fade timers).
         * Every one of them MUST be settled on unmount and on skip so no awaiting action
         * can ever hang (see the Video component audit).
         */
        const pendingSettles = new Set<() => void>();
        const cleanupFns: (() => void)[] = [];

        const setOpacity = (value: number) => {
            el.style.transition = "";
            el.style.opacity = String(value);
        };

        const playSafe = () => {
            el.play().catch((err) => {
                gameState.logger.weakWarn("NarraLeaf-React: Vfx", "Failed to play vfx video: " + err);
            });
        };

        /**
         * First-frame gate: resolve once the video can present a frame (readyState >= 2),
         * so a fade-in never reveals a blank element that pops in later. A source that
         * failed to load resolves immediately with an error log — the story never hangs
         * on a broken asset.
         */
        const waitReady = (): Promise<void> => {
            if (errored || el.error) {
                gameState.logger.error(
                    "NarraLeaf-React: Vfx",
                    "Cannot wait for a vfx whose source failed to load: " + vfx.config.src
                );
                return Promise.resolve();
            }
            if (el.readyState >= 2) {
                return Promise.resolve();
            }
            return new Promise<void>((resolve) => {
                let settled = false;
                const onLoadedData = () => settle();
                const onLoadError = () => {
                    gameState.logger.error(
                        "NarraLeaf-React: Vfx",
                        "Failed to load vfx source: " + vfx.config.src
                    );
                    settle();
                };
                const settle = () => {
                    if (settled) return;
                    settled = true;
                    pendingSettles.delete(settle);
                    el.removeEventListener("loadeddata", onLoadedData);
                    el.removeEventListener("error", onLoadError);
                    resolve();
                };
                pendingSettles.add(settle);
                el.addEventListener("loadeddata", onLoadedData);
                el.addEventListener("error", onLoadError);
                // The media may have become ready (or failed) between the check above and
                // the listeners being attached; reconcile so the gate can't be missed.
                if (el.readyState >= 2 || el.error) {
                    settle();
                }
            });
        };

        /**
         * Fade the element's opacity to `target` with a CSS transition. Completion is a
         * plain timer, not `transitionend` (unreliable in hidden tabs and on interrupt).
         * The visible opacity animates from whatever the element currently shows, so an
         * interrupted hide/show pair continues from the mid-fade value.
         */
        const fade = (target: number, options: VfxFadeOptions | undefined, op: { instant: boolean }): Promise<void> => {
            const duration = options?.duration ?? 0;
            const generation = ++fadeGeneration;

            if (op.instant || duration <= 0) {
                setOpacity(target);
                return Promise.resolve();
            }

            return new Promise<void>((resolve) => {
                let settled = false;
                let timer: ReturnType<typeof setTimeout> | null = null;
                const settle = () => {
                    if (settled) return;
                    settled = true;
                    pendingSettles.delete(settle);
                    if (timer !== null) clearTimeout(timer);
                    // Snap to the end value unless a newer fade has taken over the element.
                    if (fadeGeneration === generation && ref.current) {
                        setOpacity(target);
                    }
                    resolve();
                };
                pendingSettles.add(settle);

                el.style.transition = `opacity ${duration}ms ${toCssEasing(gameState, options?.easing)}`;
                // Force a style flush so the transition starts from the current opacity.
                void el.offsetWidth;
                el.style.opacity = String(target);
                timer = setTimeout(settle, duration);
            });
        };

        // Mount the exposed vfx state exactly once. `didError` means the source failed to
        // load; show()/hide() then resolve immediately so the story keeps advancing.
        const mountVfxState = (didError: boolean) => {
            if (stateMounted) return;
            stateMounted = true;
            errored = didError;

            gameState.mountState<ExposedStateType.vfx>(vfx, {
                show: async (options?: VfxFadeOptions) => {
                    claimed = true;
                    const op = {instant: false};
                    inFlightOps.add(op);
                    try {
                        await waitReady();
                        if (!ref.current) return;
                        if (!vfx.state.paused) {
                            playSafe();
                        }
                        await fade(vfx.config.opacity, options, op);
                    } finally {
                        inFlightOps.delete(op);
                    }
                },
                hide: async (options?: VfxFadeOptions) => {
                    claimed = true;
                    const op = {instant: false};
                    inFlightOps.add(op);
                    try {
                        await fade(0, options, op);
                        if (ref.current) {
                            el.pause();
                        }
                    } finally {
                        inFlightOps.delete(op);
                    }
                },
                pause: () => {
                    el.pause();
                },
                resume: () => {
                    playSafe();
                },
                setRate: (rate: number) => {
                    el.playbackRate = rate;
                },
            });

            // Save/load restore: a vfx that is on stage without a pending show action
            // re-appears at its configured opacity with no fade. A fresh show claims the
            // element synchronously while mountState is exposing it (the action's waiter
            // runs inside the expose event), so this scheduled check only reveals for
            // genuine restores.
            if (vfx.state.display) {
                cleanupFns.push(gameState.schedule(() => {
                    if (!claimed && ref.current) {
                        setOpacity(vfx.config.opacity);
                    }
                }, 0));
            }
        };

        const onCanPlay = () => mountVfxState(false);
        const onError = () => {
            gameState.logger.error(
                "NarraLeaf-React: Vfx",
                `Failed to load vfx source: ${vfx.config.src}` +
                (el.error ? ` (media error code ${el.error.code})` : "")
            );
            // Mount a degraded state so show()/hide() resolve and the story keeps advancing.
            mountVfxState(true);
        };

        // A player skip completes any in-flight fade instantly: pending gates and timers
        // are settled and the operations that own them snap to their final opacity.
        const skipToken = gameState.events.on(GameState.EventTypes["event:state.player.skip"], () => {
            if (inFlightOps.size === 0 && pendingSettles.size === 0) return;
            inFlightOps.forEach((op) => {
                op.instant = true;
            });
            [...pendingSettles].forEach((settle) => settle());
            gameState.logger.log("NarraLeaf-React: Vfx", "Fade skipped");
        });

        // Chromium pauses background pure-video media when the tab is hidden; resume
        // playback when the tab becomes visible again and the overlay should be moving.
        const onVisibilityChange = () => {
            if (document.visibilityState === "visible" && vfx.state.display && !vfx.state.paused && ref.current) {
                playSafe();
            }
        };
        document.addEventListener("visibilitychange", onVisibilityChange);

        el.style.opacity = "0";
        el.playbackRate = vfx.config.playbackRate;
        if (!vfx.config.muted) {
            gameState.logger.weakWarn(
                "NarraLeaf-React: Vfx",
                "Vfx is not muted; autoplay may be rejected by the browser. (src: " + vfx.config.src + ")"
            );
        }
        if (vfx.state.display && !vfx.state.paused) {
            playSafe();
        }

        el.addEventListener("canplay", onCanPlay);
        el.addEventListener("error", onError);

        // The media may already be ready or already failed before this effect ran
        // (cached, blob:, data: sources) — in which case neither `canplay` nor `error`
        // will fire again. Reconcile so we never miss the one-shot mount.
        if (el.readyState >= 3) {
            mountVfxState(false);
        } else if (el.error) {
            onError();
        }

        return () => {
            el.removeEventListener("canplay", onCanPlay);
            el.removeEventListener("error", onError);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            skipToken.cancel();
            cleanupFns.forEach((fn) => fn());

            // Settle every pending gate and fade so an awaiting action can't hang after unmount.
            [...pendingSettles].forEach((settle) => settle());

            el.pause();

            if (gameState.isStateMounted(vfx)) {
                gameState.unMountState(vfx);
            }
        };
    }, [gameState, vfx]);

    return (
        <video
            ref={ref}
            src={vfx.config.src}
            preload={"auto"}
            muted={vfx.config.muted}
            loop={vfx.config.loop}
            playsInline
            onContextMenu={(e) => e.preventDefault()}
            style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: vfx.config.fit,
                mixBlendMode: vfx.config.blendMode,
                pointerEvents: "none",
                // opacity/transition are deliberately NOT declared here: the fade engine
                // drives them imperatively, and a React-managed style prop would clobber
                // them on re-render (see the AspectScaleImage transition lesson).
            }}
        />
    );
}
