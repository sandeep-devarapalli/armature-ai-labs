import { render, screen } from '@testing-library/react';
import { AssessmentSummary } from '../../course-app/LabReviews';
import { LabForm } from '../../course-app/LabForm';
import type { CourseApi } from '../../course-app/member-api';

const assessment = (labsRequired: number) => ({ labsRequired, labsApproved: 0, writtenTotal: null, writtenPassPercent: null, writtenScore: null, writtenPassed: null, writtenAt: null, practicalPassed: null, practicalAt: null, passedAt: null });

describe('optional lab checkpoints', () => {
  it('shows no approved count when no checkpoint is required', () => {
    const { container } = render(<AssessmentSummary assessment={assessment(0) as never} labsOnly />);
    expect(container.textContent).toBe('');
  });
  it('keeps the approved count when checkpoints are required', () => {
    render(<AssessmentSummary assessment={assessment(5) as never} labsOnly />);
    expect(screen.getByText('0 of 5')).toBeInTheDocument();
  });
  it('tells the learner an optional checkpoint does not count', async () => {
    const lab = { requirementId: 'r1', moduleId: 'm14', title: 'Portfolio project (optional)', mandatory: false,
      fields: [{ key: 'repo', label: 'Repository link', type: 'text', required: true }], submission: null };
    const api = { labs: async () => ({ available: true, enrolled: true, labs: [lab], assessment: assessment(0) }) } as unknown as CourseApi;
    render(<LabForm api={api} versionId="v" moduleId="m14" userId="u" />);
    expect(await screen.findByText(/optional and does not count toward the course result/)).toBeInTheDocument();
    expect(screen.queryByText(/marked temporary/)).toBeNull();
  });
});
