
export function Singleton<T>() {
    class Singleton {
        static _instance: Singleton | null = null;
        protected constructor() { }
        public static getInstance(): T {
            if (!Singleton._instance) {
                Singleton._instance = new this();
            }
            return Singleton._instance as T;
        }
    }
    return Singleton;
}