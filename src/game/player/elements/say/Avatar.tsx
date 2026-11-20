/* eslint-disable react/prop-types */
import { avatarSourceToUrl, resolveSentenceAvatar } from "@core/elements/character/sentenceAvatar";
import type { Character } from "@core/elements/character";
import type { Image } from "@core/elements/displayable/image";
import clsx from "clsx";
import React, { useRef } from "react";
import { useDialogContext } from "./context";
import { usePreloaded } from "@player/provider/preloaded";
import { useHoldImageSrc } from "@player/lib/useHoldImageSrc";

export type DialogAvatarContext = {
    visible: boolean;
    src: string | null;
    character: Character | null;
    portrait: Image | null;
    alt: string;
};

export function useAvatar(): DialogAvatarContext {
    const dialog = useDialogContext();
    const { action, gameState } = dialog.config;
    const character = action.character;
    const sentence = action.sentence;

    if (!character || !sentence || !character.state.name) {
        return emptyAvatarContext(character || null, null);
    }

    const result = resolveSentenceAvatar(gameState, character, sentence);
    const src = avatarSourceToUrl(result.source);

    return {
        visible: !!src,
        src,
        character: result.character,
        portrait: result.portrait,
        alt: character.state.name ? `${character.state.name} avatar` : "dialog avatar",
    };
}

export function Avatar({
    className,
    style,
    alt,
    ...props
}: React.ImgHTMLAttributes<HTMLImageElement>) {
    const avatar = useAvatar();
    const { cacheManager } = usePreloaded();
    const ref = useRef<HTMLImageElement>(null);
    // The avatar on screen is on stage like any sprite: the cache must not evict it while it shows.
    useHoldImageSrc(ref);

    if (!avatar.visible || !avatar.src) {
        return null;
    }

    // Render through the cache, exactly as `<Image>` does. The preloader caches the bytes under an
    // object url and decodes *that*, so painting the original URL would miss both the bytes and
    // the decoded bitmap, and pay for them again on the frame the speaker changes. `useAvatar`
    // keeps reporting the source URL: that is what identifies the avatar to a caller.
    const src = cacheManager.get(avatar.src) || avatar.src;

    return (
        <img
            {...props}
            ref={ref}
            data-element-type="dialog-avatar"
            className={clsx("dialog-avatar", className)}
            src={src}
            alt={alt ?? avatar.alt}
            style={{
                width: 96,
                height: 96,
                objectFit: "cover",
                borderRadius: 6,
                flex: "0 0 auto",
                ...style,
            }}
        />
    );
}

function emptyAvatarContext(character: Character | null, portrait: Image | null): DialogAvatarContext {
    return {
        visible: false,
        src: null,
        character,
        portrait,
        alt: character?.state.name ? `${character.state.name} avatar` : "dialog avatar",
    };
}

export default Avatar;
