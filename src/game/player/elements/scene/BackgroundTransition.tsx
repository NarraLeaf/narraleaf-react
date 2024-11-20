// noinspection SpellCheckingInspection

import React from "react";
import {Scene as GameScene} from "@core/elements/scene";
import {ImgElementProp} from "@core/elements/transition/type";
import {deepMerge} from "@lib/util/data";
import {GameState} from "@player/gameState";
import {DisplayableChildProps} from "@player/elements/displayable/type";
import {m} from "framer-motion";
import Displayable from "@player/elements/displayable/Displayable";
import {useRatio} from "@player/provider/ratio";
import {usePreloaded} from "@player/provider/preloaded";

export default function BackgroundTransition({scene, props, state}: {
    scene: GameScene,
    props: Record<string, any>,
    state: GameState
}) {
    return (
        <Displayable
            displayable={{
                element: scene,
                skipTransform: state.game.config.elements.background.allowSkipTransform,
                skipTransition: state.game.config.elements.background.allowSkipTransition,
            }}
            child={(displayableProps) => (
                <DisplayableBackground
                    {...displayableProps}
                    scene={scene}
                    props={props}
                />
            )} state={state}
        />
    );
}

function DisplayableBackground(
    {
        transformRef,
        transformProps,
        transition,
        state,
        scene,
        props,
    }: Readonly<DisplayableChildProps & {
        scene: GameScene;
        props: Record<string, any>;
    }>
) {
    const {ratio} = useRatio();
    const {cacheManager} = usePreloaded();
    const [imageLoaded, setImageLoaded] = React.useState<boolean>(false);

    function handleImageOnload() {
        if (imageLoaded) {
            return;
        }
        setImageLoaded(true);
        scene.events.emit(GameScene.EventTypes["event:scene.imageLoaded"]);

        state.logger.debug("BackgroundTransition", "Image loaded", scene);
    }

    const emptyImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wcAAgAB9sWFXTkAAAAASUVORK5CYII=";
    const defaultProps = {
        src: emptyImage,
        style: {
            ...(state.game.config.app.debug ? {
                outline: "1px solid red",
            } : {})
        }
    };

    function tryGetCache(src: string): string {
        return cacheManager.get(src) || src;
    }

    return (
        <div>
            <m.div
                layout
                ref={transformRef}
                className={"absolute inset-0 flex items-center justify-center bg-cover bg-center overflow-hidden"}
                {...(deepMerge<any>({
                    style: {
                        ...ratio.getStyle(),
                    }
                }, transformProps))}
            >
                {
                    transition ? (() => {
                        return transition.toElementProps().map((elementProps, index) => {
                            const mergedProps =
                                deepMerge<ImgElementProp>(defaultProps, props, elementProps);
                            return (
                                <img
                                    alt={mergedProps.alt}
                                    {...mergedProps}
                                    onLoad={handleImageOnload}
                                    src={(mergedProps.src) ? tryGetCache(mergedProps.src) : emptyImage}
                                    className={"absolute"}
                                    key={index}
                                />
                            );
                        });
                    })() : (() => {
                        const mergedProps =
                            deepMerge<ImgElementProp>(defaultProps, props);
                        return (
                            <img
                                key={"last"}
                                alt={mergedProps.alt}
                                {...mergedProps}
                                onLoad={handleImageOnload}
                                src={mergedProps.src ? tryGetCache(mergedProps.src) : emptyImage}
                                className={"absolute"}
                            />
                        );
                    })()
                }
            </m.div>
        </div>
    );
}

