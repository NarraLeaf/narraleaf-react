import React, {useEffect, useRef} from "react";
import {ImgElementProp} from "@core/elements/transition/type";
import {useRatio} from "@player/provider/ratio";
import {usePreloaded} from "@player/provider/preloaded";
import {Image} from "@core/elements/displayable/image";
import {useGame} from "@core/common/player";

export default function AspectScaleImage(
    {
        props,
        onLoad,
        id,
        Ref,
    }: Readonly<{
        props: Omit<ImgElementProp, "onLoad">;
        onLoad: (event: React.SyntheticEvent<HTMLImageElement, Event>) => void;
        id?: string;
        Ref?: React.RefObject<HTMLImageElement>;
    }>
) {
    const imgRef = useRef<HTMLImageElement>(null);
    const {ratio} = useRatio();
    const [width, setWidth] = React.useState<number>(0);
    const {cacheManager} = usePreloaded();
    const {game} = useGame();

    function updateWidth() {
        const ref = Ref || imgRef;
        if (ref.current) {
            setWidth(ref.current.naturalWidth * ratio.state.scale);
        }
    }

    useEffect(() => {
        updateWidth();

        if (props.src && !cacheManager.has(props.src)) {
            game.getLiveGame().getGameState()?.logger.warn("AspectScaleImage", "Image not preloaded", props.src);
        }

        return ratio.onUpdate(updateWidth);
    }, [props.src]);

    useEffect(() => {
        updateWidth();
    }, [props, id]);

    const src: string = props.src ? (cacheManager.get(props.src) || props.src) : Image.DefaultImagePlaceholder;

    return (
        <img
            ref={Ref || imgRef}
            {...props}
            onLoad={onLoad}
            width={width}
            alt={props.alt}
            src={src}
        />
    );
}
