import { Image as GameImage } from "@core/elements/displayable/image";
import { resolveDialogAvatar, type DialogAvatarResolution } from "@core/elements/character/avatar";
import { Utils } from "@core/common/Utils";
import type { Character } from "@core/elements/character";
import type { Sentence } from "@core/elements/character/sentence";
import type { ImageSrc } from "@core/types";
import type { GameState } from "@player/gameState";

/**
 * The avatar a dialog shows for `sentence` spoken by `character`, resolved against the stage as it
 * stands now: the sentence's own avatar, then the avatar of the portrait the character is wearing on
 * stage, then the character's.
 *
 * `useAvatar` asks this while a line is on screen, and the backlog asks it once when the line is
 * reached, so the two cannot disagree about which face a line had.
 *
 * @internal
 */
export function resolveSentenceAvatar(
    gameState: GameState,
    character: Character | null,
    sentence: Sentence | null,
): DialogAvatarResolution {
    if (!character || !sentence || !character.state.name) {
        return { source: null, character: character || null, portrait: null };
    }
    const portraitConfig = gameState.findCurrentPortraitForCharacter(character);
    const portrait = portraitConfig?.image || null;
    const currentSrc = portrait ? GameImage.getSrcURL(portrait) : null;
    const tags = portrait && GameImage.isTagSrc(portrait)
        ? [...(portrait.state.currentSrc as string[])]
        : null;
    return resolveDialogAvatar({
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
}

/** An avatar source as the URL an `<img>` takes, or null for none. @internal */
export function avatarSourceToUrl(source: ImageSrc | null): string | null {
    if (!source) {
        return null;
    }
    return Utils.srcToURL(source);
}
