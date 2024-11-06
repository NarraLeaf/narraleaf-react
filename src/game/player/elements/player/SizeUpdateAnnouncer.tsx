import React, {useEffect} from "react";
import {useRatio} from "@player/provider/ratio";

export default function SizeUpdateAnnouncer(
    {containerRef}: Readonly<{ containerRef: React.RefObject<HTMLDivElement> }>
) {
    const {ratio} = useRatio();

    /**
     * Request ratio update when the container size changes
     */
    useEffect(() => {
        const container = containerRef.current;
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
    }, [containerRef.current]);

    return null;
}