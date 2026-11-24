import { createContext } from 'react';
import type { AssignmentResult, AssignmentWork } from './member-api';

// Where a learner's code and scores are kept. MemberLesson provides it for enrolled learners; without it
// (samples, previews) an assignment still runs, but nothing is saved.
export interface AssignmentStore {
  load(blockId: string): Promise<AssignmentWork | null>;
  save(blockId: string, files: Record<string, string>, result: AssignmentResult | null, revision: number | null): Promise<AssignmentWork>;
}
export const AssignmentStoreContext = createContext<AssignmentStore | null>(null);
