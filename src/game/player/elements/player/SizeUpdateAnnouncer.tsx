import React, {useEffect} from "react";
import {useRatio} from "@player/provider/ratio";

/**@internal */
export default function SizeUpdateAnnouncer(
    {ref}: Readonly<{ ref: React.RefObject<HTMLDivElement | null> }>
) {
    const {ratio} = useRatio();

    /**
     * Request ratio update when the container size changes
     */
    useEffect(() => {
        const container = ref.current;
        if (!container) {
            return;
        }

        const observer = new ResizeObserver(() => {
            ratio.requestUpdate();
        });

        observer.observe(container);

        return () => {
            observer.disconnect();
        };
    }, [ref.current]);

    return null;
}