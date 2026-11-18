/** The declarations of scripts/own-checks.mjs, for the tests that try its checks. */
export declare const allowedDependencies: readonly string[];
export declare function checkDependencies(root: string): string[];
export declare function cardStatuses(root: string): Map<string, string>;
export declare function checkFeatureModules(root: string): string[];
export declare function checkTodos(root: string): string[];
export declare function ownProblems(root: string): string[];
