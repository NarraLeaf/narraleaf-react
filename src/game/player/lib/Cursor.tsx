import React, {useEffect, useRef, useState} from "react";
import Isolated from "@player/lib/isolated";
import {useRatio} from "../provider/ratio";

export default function Cursor(
    {
        src,
        width,
        height,
    }: Readonly<{
        src: string;
        width: number;
        height: number;
    }>
) {
    const [position, setPosition] = useState<{ x: number, y: number }>({x: 0, y: 0});
    const [visible, setVisible] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const {ratio} = useRatio();

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;
                setPosition({x, y});
                if (!visible) setVisible(true);
            }
        };

        window.addEventListener("mousemove", handleMouseMove);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
        };
    }, [visible]);

    return (
        <Isolated $ref={containerRef} className={"overflow-hidden relative"}>
            <img
                src={src}
                style={{
                    position: "absolute",
                    left: position.x,
                    top: position.y,
                    width: width,
                    height: height,
                    pointerEvents: "none",
                    zIndex: 1001,
                    display: visible ? "block" : "none",
                    cursor: "none",
                    transform: `scale(${ratio.state.scale})`,
                }}
                alt=""
            />
        </Isolated>
    );
}