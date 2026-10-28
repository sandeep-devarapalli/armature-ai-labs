export interface DiagramMap {
  format: 'armature-private-diagrams-v1';
  sourceSha256: string;
  diagrams: Record<string, string>;
}
export function buildDiagramMap(input: string): Promise<DiagramMap>;
export function resolveLessonDiagrams<T extends { modules: Array<{ lessonContent: Record<string, { blocks: Array<{ type: string; content: { name?: string; svgCode?: string } }> }> }> }>(content: T, map: DiagramMap, scope?: string): T;
