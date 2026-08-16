import type React from "react";
import type {ElementProp} from "@core/elements/transition/type";

/**
 * Write a transition resolver's output onto a live DOM node.
 *
 * Transition resolvers return React-shaped props, but nothing about them goes through React:
 * every host writes them imperatively, frame by frame, because a re-render per frame would fight
 * the animation (and, for images, the `src` is not a React prop at all — see `Image.tsx`). So
 * `style` is merged onto the element's inline style and everything else becomes an attribute.
 *
 * Shared by the per-displayable hook (`useDisplayable`) and the stage transition driver
 * (`StageTransitionManager`), which drive different elements but the identical prop shape.
 *
 * @param element - The node to write to. Callers own the mounted-ness check.
 * @param properties - Resolver output, already merged over the host's base props.
 * @param propOverwrite - Last chance to rewrite the attribute set (not the style) before it is
 * written — a host uses this to drop attributes that are meaningless on its element.
 * @internal
 */
export function assignElementProps<U extends HTMLElement>(
    element: U,
    properties: ElementProp<U, React.HTMLAttributes<U>>,
    propOverwrite?: (props: ElementProp<U>) => ElementProp<U>,
): void {
    const styleUpdates: Partial<CSSStyleDeclaration> = {};
    const attributesToUpdate: ElementProp<U, React.HTMLAttributes<U>> = {} as ElementProp<U, React.HTMLAttributes<U>>;

    Object.keys(properties).forEach((k) => {
        const key = k as keyof Partial<ElementProp<U>>;
        if (key === "style" && properties.style) {
            Object.assign(styleUpdates, properties.style);
        } else if (properties[key] !== undefined && key !== "key") {
            attributesToUpdate[key] = properties[key];
        }
    });

    if (Object.keys(styleUpdates).length > 0) {
        Object.assign(element.style, styleUpdates);
    }

    const overwrite = propOverwrite ? propOverwrite(attributesToUpdate) : attributesToUpdate;
    for (const [attr, value] of Object.entries(overwrite)) {
        if (element.getAttribute(attr) === value) {
            continue;
        }
        element.setAttribute(attr, value);
    }
}
