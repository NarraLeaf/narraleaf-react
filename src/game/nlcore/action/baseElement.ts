
export class BaseElement {
    protected id: string = "";

    setId(id: string) {
        this.id = id;
    }

    getId() {
        return this.id;
    }
}

