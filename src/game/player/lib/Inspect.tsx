import React, {useState} from "react";
import {DivElementProp} from "@core/elements/transition/type";
import {useGame} from "@player/provider/game-state";

type InspectStyle = {
    border?: "solid" | "dashed" | "dotted";
    borderWidth?: number;
    color?: React.CSSProperties["color"];
};

type ElementProps<T extends keyof React.JSX.IntrinsicElements | React.ComponentType<any>> =
    T extends keyof HTMLElementTagNameMap
        ? React.HTMLProps<HTMLElementTagNameMap[T]>
        : T extends keyof SVGElementTagNameMap
            ? React.SVGProps<SVGElementTagNameMap[T]>
            : T extends React.ComponentType<any>
                ? React.ComponentProps<T>
                : never;

function InspectBase<T extends keyof React.JSX.IntrinsicElements | React.ComponentType<any>>(
    {
        children,
        border = "solid",
        color = "red",
        tag,
        borderWidth = 1,
        as: Component = "div",
        ...props
    }: Readonly<DivElementProp & {
        children?: React.ReactNode;
        tag?: string;
        as?: T;
    } & InspectStyle & ElementProps<T>>) {
    const {game} = useGame();
    const [isHovered, setIsHovered] = useState(false);

    if (!game.config.app.inspector) {
        return <Component {...props}>{children}</Component>;
    }

    const commonProps = {
        ...props,
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
        style: {
            ...(props.style || {}),
            border: `${border} ${borderWidth}px ${color}`,
            zIndex: isHovered ? 1000 : "auto",
        },
    };

    return (
        <Component {...commonProps}>
            {tag && isHovered && (
                <span className="absolute top-0 left-0 bg-white text-black border-2 border-black">
                    {tag}
                </span>
            )}
            {children}
        </Component>
    );
}

function InspectDiv(props: Readonly<DivElementProp & { children?: React.ReactNode; tag?: string; } & InspectStyle>) {
    return <InspectBase {...props} as="div"/>;
}

function InspectSpan(props: Readonly<DivElementProp & { children?: React.ReactNode; tag?: string; } & InspectStyle>) {
    return <InspectBase {...props} as="span"/>;
}

function InspectButton(props: Readonly<DivElementProp & {
    children?: React.ReactNode;
    tag?: string;
} & InspectStyle>) {
    return <InspectBase {...props} as="button"/>;
}

const Inspect = {
    Div: InspectDiv,
    Span: InspectSpan,
    Button: InspectButton,
};

export default Inspect;