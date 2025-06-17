// 相对路径导航示例
// 假设当前路径是 /me/settings

function resolvePath(currentPath, relativePath) {
    // 如果已经是绝对路径，直接返回
    if (relativePath.startsWith("/")) {
        return relativePath;
    }

    // 解析当前路径
    const currentSegments = currentPath.split("/").filter(segment => segment.length > 0);
    const pathSegments = relativePath.split("/");
    const resolvedSegments = [];

    // 从当前路径开始
    resolvedSegments.push(...currentSegments);

    for (let i = 0; i < pathSegments.length; i++) {
        const segment = pathSegments[i];
        
        if (segment === "" || segment === ".") {
            // "." 或空段表示当前目录，不做任何操作
            continue;
        } else if (segment === "..") {
            // ".." 表示父目录，移除最后一个段
            if (resolvedSegments.length > 0) {
                resolvedSegments.pop();
            }
        } else {
            // 普通段，添加到路径中
            resolvedSegments.push(segment);
        }
    }

    return "/" + resolvedSegments.join("/");
}

// 测试示例
const currentPath = "/me/settings";

console.log("当前路径:", currentPath);
console.log("导航 'about':", resolvePath(currentPath, "about")); // 输出: /me/settings/about
console.log("导航 './about':", resolvePath(currentPath, "./about")); // 输出: /me/settings/about
console.log("导航 '../about':", resolvePath(currentPath, "../about")); // 输出: /me/about
console.log("导航 '../../about':", resolvePath(currentPath, "../../about")); // 输出: /about
console.log("导航 'details':", resolvePath(currentPath, "details")); // 输出: /me/settings/details
console.log("导航 '../account':", resolvePath(currentPath, "../account")); // 输出: /me/account 