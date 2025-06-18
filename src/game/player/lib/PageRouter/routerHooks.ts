import { useLayout } from "./Layout";
import { useRouter } from "./router";

export function usePathname() {
    const router = useRouter();
    return router.getPathname();
}

export function useParams<T extends Record<string, string>>(): T {
    const { router, path } = useLayout();
    return router.extractParams(router.getCurrentPath(), path) as T;
}

export function useQueryParams<T extends Record<string, string>>(): T {
    const router = useRouter();
    return router.getQueryParams() as T;
}
