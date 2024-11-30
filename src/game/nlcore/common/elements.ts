import {Character} from "../elements/character";
import {Condition, Lambda} from "../elements/condition";
import {Control} from "@core/elements/control";
import {
    Image as ImageClass,
    RichImageUserConfig,
    TagDefinitions,
    TagGroupDefinition,
    TagSrcResolver
} from "../elements/displayable/image";
import {Menu} from "../elements/menu";
import {Scene} from "../elements/scene";
import {Script} from "../elements/script";
import {Sound, SoundType} from "@core/elements/sound";
import {Story} from "../elements/story";
import {Transform} from "@core/elements/transform/transform";
import {Sentence} from "@core/elements/character/sentence";
import {Word} from "@core/elements/character/word";
import {Text} from "@core/elements/displayable/text";
import {Pause} from "@core/elements/character/pause";
import {StaticImageData} from "@core/types";
import {Persistent} from "@core/elements/persistent";

interface ImageConstructor {
    new<T extends TagGroupDefinition | null>(
        config: Omit<Partial<RichImageUserConfig<T>>, "src"> &
            (T extends null ?
                {
                    src: string | StaticImageData;
                    tag?: never;
                } : T extends TagGroupDefinition ?
                    {
                        src: TagSrcResolver<T>;
                        tag: TagDefinitions<T>;
                    }
                    : never),
    ): ImageClass<T>;
}

const Image: ImageConstructor = function <T extends TagGroupDefinition | null>(
    this: ImageClass<T>,
    config: Omit<Partial<RichImageUserConfig<T>>, "src"> &
        (T extends null ?
            {
                src: string | StaticImageData;
                tag?: never;
            } : T extends TagGroupDefinition ?
                {
                    src: TagSrcResolver<T>;
                    tag: TagDefinitions<T>;
                }
                : never),
): ImageClass<T> {
    if (!new.target) {
        throw new Error("Image is a constructor and should be called with new keyword");
    }
    return new ImageClass<T>(
        config as Partial<RichImageUserConfig<T>>,
        config.tag as TagDefinitions<T> | undefined
    );
} as unknown as ImageConstructor;

export {
    Character,
    Condition,
    Control,
    Image,
    Lambda,
    Menu,
    Scene,
    Script,
    Sentence,
    Sound,
    SoundType,
    Story,
    Transform,
    Word,
    Text,
    Pause,
    Persistent,
};