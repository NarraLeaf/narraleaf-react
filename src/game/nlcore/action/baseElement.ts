import {ElementStateRaw} from "@core/elements/story";

export class BaseElement {
    /**@internal */
    protected id: string = "";

    /**@internal */
    setId(id: string) {
        this.id = id;
    }

    /**@internal */
    getId() {
        return this.id;
    }

    /**@internal */
    reset() {
    }

    /**@internal */
    fromData(_: ElementStateRaw) {
        return this;
    }
}

