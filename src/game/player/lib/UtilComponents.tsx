import React, {forwardRef, ReactNode} from "react";
import PropTypes from "prop-types";
import clsx from "clsx";
import {DivElementProp} from "@core/elements/transition/type";

type ForwardClassName = {
    className?: string;
};
type ForwardChildren = {
    children?: ReactNode;
};
type ForwardRef = {
    ref?: React.Ref<HTMLDivElement>;
};

const ForwardClassNamePropType = {
    className: PropTypes.string,
} as const;
const ForwardChildrenPropType = {
    children: PropTypes.node,
} as const;

function forwardBox(
    name: string,
    component: (
        props: Readonly<{
            children?: ReactNode;
            className?: string;
            $ref?: React.Ref<HTMLDivElement>;
        } & DivElementProp>
    ) => React.ReactElement,
): React.ForwardRefExoticComponent<DivElementProp> {
    const com = forwardRef<HTMLDivElement, ForwardClassName & ForwardChildren & ForwardRef & DivElementProp>(
        ({children, className, ...rest}, ref) => {
            return component({children, className, $ref: ref, ...rest});
        }
    );
    com.displayName = name;
    com.propTypes = {
        ...ForwardClassNamePropType,
        ...ForwardChildrenPropType,
    };
    return com;
}

const VBox = forwardBox("VBox", ({children, className, $ref, ...rest}) => {
    return (
        <div ref={$ref} className={clsx("flex flex-col", className)} {...rest}>
            {children}
        </div>
    );
});

const HBox = forwardBox("HBox", ({children, className, $ref, ...rest}) => {
    return (
        <div ref={$ref} className={clsx("flex flex-row", className)} {...rest}>
            {children}
        </div>
    );
});

export {
    VBox,
    HBox,
};