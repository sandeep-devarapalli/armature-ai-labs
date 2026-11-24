export interface Course {
  id: string;
  title: string;
  description: string;
  category: string;
  level: string;
  duration: string;
  moduleCount: number;
  lessonCount: number;
}

export interface Question {
  id: string;
  question: string;
  options: { id: string; text: string; isCorrect: boolean }[];
  explanation: string;
}

export interface AssignmentFile { name: string; code: string; editable: boolean }
export interface AssignmentTest { name: string; code: string; hidden: boolean }

export interface Block {
  id: string;
  type: string;
  content: {
    text?: string; html?: string; level?: number;
    term?: string; definitionHtml?: string;
    title?: string; bodyHtml?: string; variant?: string;
    items?: string[]; style?: string; headers?: string[]; rows?: string[][];
    code?: string; filename?: string; language?: string; isConceptual?: boolean;
    latex?: string; caption?: string; name?: string; svgCode?: string;
    sceneId?: string; parameters?: { value: number }; description?: string;
    courseTitle?: string; moduleObjective?: string;
    promptHtml?: string; placeholder?: string; questions?: Question[];
    briefHtml?: string; files?: AssignmentFile[]; tests?: AssignmentTest[]; support?: { name: string; base64: string }[];
    packages?: string[]; timeLimitSeconds?: number; python?: string;
  };
}

export interface CourseModule {
  title: string;
  subItems: string[];
  lessonContent: Record<string, { blocks: Block[] }>;
}

export interface CourseContent { modules: CourseModule[] }
