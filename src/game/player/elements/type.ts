import React from "react";
import {SayElementProps} from "@player/elements/say/type";
import {MenuElementProps} from "@player/elements/menu/type";

export type Components<T extends Record<string, any>> = (props: Readonly<T>) => React.JSX.Element;
export type SayComponent = Components<SayElementProps>;
export type MenuComponent = Components<MenuElementProps>;
export type ComponentsTypes = {
    say: SayComponent;
    menu: MenuComponent;
};

export type {
    SayElementProps,
    MenuElementProps,
};
