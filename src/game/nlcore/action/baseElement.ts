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
}

