"use client";

import {Image, Image as GameImage} from "@core/elements/image";
import {GameState} from "@player/gameState";
import React, {useEffect} from "react";

export const Img = React.memo(function ({
                                            state,
                                            image,
                                            onLoad,
                                        }: Readonly<{
    state: GameState;
    image: GameImage;
    onLoad?: () => void;
}>) {
    const props: any = {
        ...image.toHTMLElementProps(),
        ref: image.getScope(),
        src: image.state.src,
    };

    useEffect(() => {
        const initTransform = image.toTransform();
        Object.assign(image.getScope()?.current || {}, initTransform.propToCSS(state, image.state));

        image.events.emit(Image.EventTypes["event:image.elementLoaded"]);
    }, []);

    return (
        <img {...props} alt={""} onLoad={onLoad}/>
    );
})