import React, {useEffect, useMemo, useRef} from "react";
import {GameState} from "@player/gameState";
import {Puppet as GamePuppet} from "@core/elements/displayable/puppet";
import type {PuppetInstance, PuppetSize} from "@core/game/puppet/puppetBackend";
import {resolvePuppetSibling} from "@core/game/puppet/puppetBackend";
import {Transition} from "@core/elements/transition/transition";
import Inspect from "@player/lib/Inspect";
import {useDisplayable} from "@player/elements/displayable/Displayable";
import {useExposeState} from "@player/lib/useExposeState";
import {usePreloaded} from "@player/provider/preloaded";
import {Utils} from "@core/common/Utils";
import {ExposedStateType} from "@player/type";
import {useFlush} from "@player/lib/flush";

/**
 * The engine's half of a puppet: a box, posed by the same machinery every displayable uses, with a
 * host-registered backend drawing inside it.
 *
 * Everything below is written so that a backend cannot take the stage down with it. A missing
 * backend, a `mount` that throws, a model that never loads — each of them leaves the element on
 * stage, transformable and saveable, with a status an editor host can read and show.
 *
 * @internal
 */
export default function Puppet({state, puppet}: Readonly<{
    state: GameState;
    puppet: GamePuppet;
}>) {
    const [flush] = useFlush();
    const {cacheManager} = usePreloaded();
    const hostRef = useRef<HTMLDivElement | null>(null);
    const size: PuppetSize = useMemo(
        () => puppet._resolveSize({width: state.game.config.width, height: state.game.config.height}),
        [puppet, state.game.config.width, state.game.config.height]
    );
    const sizeRef = useRef<PuppetSize>(size);
    sizeRef.current = size;

    const {
        transformRef,
        transitionRefs,
        initDisplayable,
        applyTransform,
        applyLoop,
        stopLoop,
        applyTransition,
        updateStyleSync,
        deps,
    } = useDisplayable<Transition<HTMLDivElement>, HTMLDivElement>({
        element: puppet,
        state: puppet.transformState,
        skipTransform: state.game.config.allowSkipImageTransform,
        skipTransition: state.game.config.allowSkipImageTransition,
        transitionsProps: [
            {
                style: {
                    position: "relative",
                    width: `${size.width}px`,
                    height: `${size.height}px`,
                },
            },
        ],
    });

    useExposeState<ExposedStateType.puppet>(puppet, {
        initDisplayable,
        applyTransform,
        applyLoop,
        stopLoop,
        applyTransition,
        updateStyleSync,
        flush,
    }, [...deps]);

    // Mount once, for as long as the element is on stage. A puppet cannot change its `src`, which is
    // what makes this safe: there is no input here that could ask for a different model, so the
    // backend's instance never has to be torn down and rebuilt underneath a live transform.
    useEffect(() => {
        const container = hostRef.current;
        if (!container) {
            return;
        }

        const game = state.game;
        const backendName = puppet.config.backend;
        const backend = game.getPuppetBackend(backendName);

        if (!backend) {
            // Users bring their own renderers, so a missing one is a normal state, not a crash.
            puppet._setStatus("missing-backend");
            game.getPuppetBackendRegistry().reportMissing(backendName, (message) => {
                state.logger.warn("Puppet", message);
            });
            return () => {
                puppet._setStatus("unmounted");
            };
        }

        let instance: PuppetInstance;
        try {
            instance = backend.mount(container, {
                src: puppet.config.src,
                options: puppet.config.options,
                size: sizeRef.current,
                resolveSrc,
                resolveSibling: (relativePath: string) =>
                    resolveSrc(resolvePuppetSibling(puppet.config.src, relativePath)),
                warn: (message: string, detail?: unknown) => {
                    state.logger.warn("Puppet", message, detail);
                },
            });
        } catch (e) {
            puppet._setStatus("error");
            state.logger.error(
                "Puppet",
                `Backend "${backendName}" threw while mounting "${puppet.config.src}"`, e
            );
            return () => {
                puppet._setStatus("unmounted");
            };
        }

        let disposed = false;
        puppet._attachInstance(instance);
        puppet._setStatus("loading");

        // The whole state is pushed once here rather than replayed action by action — that is the
        // point of `apply` taking a complete state, and it is what makes restoring a saved game a
        // single call. It also means the backend's first `apply` lands before `ready()` is called,
        // which is the documented order: a model wants the pose it is loading into at load time,
        // not a snap to it one frame after it appears.
        Promise.resolve()
            .then(() => puppet._applyState())
            // `ready` is required by `PuppetInstance`, and the guard is deliberate all the same: the
            // backend comes from the host, not from us, so nothing has typechecked it against the
            // contract. A backend that omits `ready` reaches `ready` status right after `apply`
            // instead of taking the stage down with a TypeError.
            //
            // The `disposed` check keeps the promise the contract makes — nothing is called on an
            // instance after `dispose()`. An `apply` that resolves slowly would otherwise land here
            // after the element left the stage and ask a torn-down backend whether it is ready.
            .then(() => (!disposed && typeof instance.ready === "function" ? instance.ready() : undefined))
            .then(() => {
                if (!disposed) {
                    puppet._setStatus("ready");
                }
            })
            .catch((e) => {
                if (disposed) {
                    return;
                }
                puppet._setStatus("error");
                state.logger.error(
                    "Puppet",
                    `Backend "${backendName}" failed to load "${puppet.config.src}"`, e
                );
            });

        return () => {
            disposed = true;
            puppet._attachInstance(null);
            puppet._setStatus("unmounted");
            try {
                instance.dispose();
            } catch (e) {
                state.logger.error("Puppet", `Backend "${backendName}" threw while disposing`, e);
            }
        };
    }, []);

    // `size` is the same object on the mount pass, so the backend is not told to resize to the size
    // it was just mounted at.
    const lastSizeRef = useRef<PuppetSize>(size);
    useEffect(() => {
        const last = lastSizeRef.current;
        if (last.width === size.width && last.height === size.height) {
            return;
        }
        lastSizeRef.current = size;

        const instance = puppet._getInstance();
        // As with `ready` above: `resize` is required by the contract, but the contract is satisfied
        // by host code the engine never sees. A backend that omits it simply never hears about the
        // new size; it does not break the stage resize for everything else on it.
        if (!instance || typeof instance.resize !== "function") {
            return;
        }
        try {
            instance.resize(size);
        } catch (e) {
            state.logger.error("Puppet", `Backend "${puppet.config.backend}" threw while resizing`, e);
        }
    }, [size]);

    /* Every cached url this puppet has taken, held against eviction until the element leaves the
       stage. A backend keeps the urls it was given - a texture page is loaded once and drawn for
       as long as the model is on screen - and unlike an `<img>` it has no way of telling the cache
       what it is still using. Without this the cache could revoke a texture's object url out from
       under a live model the first time a memory budget went looking for room. */
    const heldUrls = useRef<Set<string>>(new Set());
    useEffect(() => {
        const held = heldUrls.current;
        return () => {
            held.forEach(url => cacheManager.release(url));
            held.clear();
        };
    }, []);

    /* The same resolution images get: anything warmed by `scene.preloadImage()` is served from the
       preload cache (which stores an object URL, reachable only through `get`), and anything else
       is handed back untouched for the backend to fetch itself. */
    function resolveSrc(src: string): string {
        if (Utils.isDataURI(src)) {
            return src;
        }
        const cached = cacheManager.get(src);
        if (!cached) {
            return src;
        }
        if (!heldUrls.current.has(cached)) {
            heldUrls.current.add(cached);
            cacheManager.hold(cached);
        }
        return cached;
    }

    return (
        <Inspect.Div data-element-type={"puppet"}>
            {/* No `layout` here: the wrapper's transform is written imperatively, frame by frame,
                by `transform.animate` — layout projection measures on any re-render and writes to
                the same node, so the two fight mid-animation. */}
            <Inspect.mDiv
                tag={"puppet.container"}
                color={"blue"}
                border={"dashed"}
                ref={transformRef}
                className={"absolute"}
            >
                {transitionRefs.map(([ref, key]) => (
                    <div
                        key={key}
                        ref={ref}
                        className={puppet.config.className}
                    >
                        <div
                            ref={hostRef}
                            className={"w-full h-full"}
                            data-puppet-id={puppet.getId()}
                            data-puppet-backend={puppet.config.backend}
                        />
                    </div>
                ))}
            </Inspect.mDiv>
        </Inspect.Div>
    );
}
