import React, {useState} from "react";
import {DivElementProp} from "@core/elements/transition/type";
import {useGame} from "@player/provider/game-state";
import {motion} from "motion/react";

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
        ref,
        ...props
    }: Readonly<DivElementProp & {
        children?: React.ReactNode;
        tag?: string;
        as?: T;
        ref?: React.RefObject<HTMLDivElement | null>;
    } & InspectStyle & ElementProps<T>> & Record<string, any>) {
    const game = useGame();
    const [isHovered, setIsHovered] = useState(false);

    if (!game.config.app.inspector) {
        return <Component {...props} ref={ref}>{children}</Component>;
    }

    const commonProps = {
        ...props,
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
        style: {
            ...(props.style || {}),
            outline: `${borderWidth}px ${border} ${color}`,
            zIndex: isHovered ? 1000 : "auto",
        },
    };

    return (
        <Component {...commonProps} ref={ref}>
            {tag && isHovered && (
                <span className="absolute top-0 left-0 bg-white text-black border-2 border-black text-sm">
                    {tag}
                </span>
            )}
            {children}
        </Component>
    );
}

/**
 * For self-closing tags
 * @constructor
 */
function InspectCloseBase<T extends keyof React.JSX.IntrinsicElements | React.ComponentType<any>>(
    {
        border = "solid",
        color = "red",
        tag,
        borderWidth = 1,
        as: Component = "img",
        ...props
    }: Readonly<DivElementProp & {
        tag?: string;
        as?: T;
    } & InspectStyle & ElementProps<T>>
) {
    const game = useGame();
    const [isHovered, setIsHovered] = useState(false);

    if (!game.config.app.inspector) {
        return <Component {...props}/>;
    }

    const commonProps = {
        ...props,
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
        style: {
            ...(props.style || {}),
            outline: `${border} ${borderWidth}px ${color}`,
            zIndex: isHovered ? 1000 : "auto",
        },
    };

    return (
        <div>
            <Component {...commonProps} />
            {tag && isHovered && (
                <span className="absolute top-0 left-0 bg-white text-black border-2 border-black">
                    {tag}
                </span>
            )}
        </div>
    );
}

function InspectDiv(props: Readonly<DivElementProp & { children?: React.ReactNode; tag?: string; } & InspectStyle>) {
    return <InspectBase {...props} as="div"/>;
}

function InspectSpan(props: Readonly<DivElementProp & { children?: React.ReactNode; tag?: string; } & InspectStyle>) {
    return <InspectBase {...props} as="span"/>;
}

function InspectImg(props: Readonly<DivElementProp & { tag?: string; } & InspectStyle>) {
    return <InspectCloseBase {...props} as="img"/>;
}

function InspectButton(props: Readonly<DivElementProp & {
    children?: React.ReactNode;
    tag?: string;
} & InspectStyle>) {
    return <InspectBase {...props} as="button"/>;
}

function InspectFramerMotionDiv(props: Readonly<DivElementProp & {
    children?: React.ReactNode;
    tag?: string;
    ref?: React.RefObject<HTMLDivElement | null>;
    layout?: boolean;
} & InspectStyle>) {
    return <InspectBase {...props} as={motion.div} ref={props.ref} layout={props.layout}/>;
}

const Inspect = {
    Div: InspectDiv,
    Span: InspectSpan,
    Button: InspectButton,
    Img: InspectImg,
    mDiv: InspectFramerMotionDiv,
};

export default Inspect;