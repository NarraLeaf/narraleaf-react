/* eslint-disable react/prop-types */
import { Image as GameImage } from "@core/elements/displayable/image";
import { resolveDialogAvatar } from "@core/elements/character/avatar";
import { Utils } from "@core/common/Utils";
import type { Character } from "@core/elements/character";
import type { ImageSrc } from "@core/types";
import type { Image } from "@core/elements/displayable/image";
import clsx from "clsx";
import React from "react";
import { useDialogContext } from "./context";
import { usePreloaded } from "@player/provider/preloaded";

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

    const portraitConfig = gameState.findCurrentPortraitForCharacter(character);
    const portrait = portraitConfig?.image || null;
    const currentSrc = portrait ? GameImage.getSrcURL(portrait) : null;
    const tags = portrait && GameImage.isTagSrc(portrait)
        ? [...(portrait.state.currentSrc as string[])]
        : null;
    const result = resolveDialogAvatar({
        character,
        sentence,
        portrait,
        currentSrc,
        tags,
        gameState,
        sentenceAvatar: sentence.config.avatar,
        portraitAvatar: portraitConfig?.avatar,
        characterAvatar: character.config.avatar,
    });
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

    if (!avatar.visible || !avatar.src) {
        return null;
    }

    // Render through the cache, exactly as `<Image>` does. The preloader stores a base64
    // re-encoding and decodes *that*, so painting the original URL would miss both the bytes and
    // the decoded bitmap, and pay for them again on the frame the speaker changes. `useAvatar`
    // keeps reporting the source URL: that is what identifies the avatar to a caller.
    const src = cacheManager.get(avatar.src) || avatar.src;

    return (
        <img
            {...props}
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

function avatarSourceToUrl(source: ImageSrc | null): string | null {
    if (!source) {
        return null;
    }
    return Utils.srcToURL(source);
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
