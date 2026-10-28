export const courseOrigin: string;
export const backendOrigin: string;
export function assertCourseProduction(env: Record<string, string | undefined>): void;
export function courseHostingAssets(backend: string): Record<string, string>;
