import type { ImageSrc } from "@core/types";
import type { Character } from "@core/elements/character";
import type { Image } from "@core/elements/displayable/image";
import type { Sentence } from "@core/elements/character/sentence";
import type { GameState } from "@player/gameState";

export type DialogAvatarSource = ImageSrc | null;

export type DialogAvatarResolverContext = {
    character: Character;
    sentence: Sentence | null;
    portrait: Image | null;
    currentSrc: string | null;
    tags: string[] | null;
    gameState: GameState;
};

export type DialogAvatarResolver = (ctx: DialogAvatarResolverContext) => DialogAvatarSource | undefined;

export type DialogAvatar = DialogAvatarSource | DialogAvatarResolver;

export type CharacterPortraitConfig = {
    image: Image;
    avatar?: DialogAvatar;
};

export type NormalizedCharacterPortraitConfig = {
    image: Image;
    avatar?: DialogAvatar;
};

export type DialogAvatarResolution = {
    source: DialogAvatarSource;
    character: Character | null;
    portrait: Image | null;
};

export function normalizeCharacterPortraitConfig(
    portrait: Image | CharacterPortraitConfig
): NormalizedCharacterPortraitConfig {
    if ("image" in portrait) {
        return {
            image: portrait.image,
            avatar: portrait.avatar,
        };
    }
    return {
        image: portrait,
    };
}

export function resolveDialogAvatar(
    ctx: DialogAvatarResolverContext & {
        sentenceAvatar?: DialogAvatar | false;
        portraitAvatar?: DialogAvatar;
        characterAvatar?: DialogAvatar | false;
    }
): DialogAvatarResolution {
    const { sentenceAvatar, portraitAvatar, characterAvatar } = ctx;

    if (!ctx.character || !ctx.character.state.name) {
        return emptyDialogAvatarResolution(ctx);
    }
    if (sentenceAvatar === false) {
        return emptyDialogAvatarResolution(ctx);
    }

    const sentenceResult = resolveAvatarValue(sentenceAvatar, ctx);
    if (sentenceResult.resolved) {
        return {
            source: sentenceResult.source,
            character: ctx.character,
            portrait: ctx.portrait,
        };
    }

    const portraitResult = resolveAvatarValue(portraitAvatar, ctx);
    if (portraitResult.resolved) {
        return {
            source: portraitResult.source,
            character: ctx.character,
            portrait: ctx.portrait,
        };
    }

    const characterResult = resolveAvatarValue(characterAvatar, ctx);
    if (characterResult.resolved) {
        return {
            source: characterResult.source,
            character: ctx.character,
            portrait: ctx.portrait,
        };
    }

    return {
        source: null,
        character: ctx.character,
        portrait: ctx.portrait,
    };
}

function resolveAvatarValue(
    avatar: DialogAvatar | false | undefined,
    ctx: DialogAvatarResolverContext
): { resolved: boolean; source: DialogAvatarSource } {
    if (avatar === false || typeof avatar === "undefined") {
        return {
            resolved: false,
            source: null,
        };
    }
    if (typeof avatar === "function") {
        const source = avatar(ctx);
        return {
            resolved: typeof source !== "undefined",
            source: source ?? null,
        };
    }
    return {
        resolved: true,
        source: avatar,
    };
}

function emptyDialogAvatarResolution(
    ctx: Pick<DialogAvatarResolverContext, "character" | "portrait">
): DialogAvatarResolution {
    return {
        source: null,
        character: ctx.character || null,
        portrait: ctx.portrait || null,
    };
}
