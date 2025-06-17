import { useLayout } from "./Layout";
import { useRouter } from "./router";

export function usePathname() {
    const router = useRouter();
    return router.getPathname();
}

export function useParams() {
    const { router, path } = useLayout();
    return router.extractParams(router.getCurrentPath(), path);
}

export function useQueryParams() {
    const router = useRouter();
    return router.getQueryParams();
}

