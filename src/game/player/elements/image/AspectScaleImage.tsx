import React, {useEffect, useRef} from "react";
import {ImgElementProp} from "@core/elements/transition/type";
import {useRatio} from "@player/provider/ratio";

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

    function updateWidth() {
        const ref = Ref || imgRef;
        if (ref.current) {
            setWidth(ref.current.naturalWidth * ratio.state.scale);
        }
    }

    useEffect(() => {
        updateWidth();

        return ratio.onUpdate(updateWidth);
    }, [props.src]);

    useEffect(() => {
        updateWidth();
    }, [props, id]);

    return (
        <img
            ref={Ref || imgRef}
            {...props}
            onLoad={onLoad}
            width={width}
            alt={props.alt}
        />
    );
}
