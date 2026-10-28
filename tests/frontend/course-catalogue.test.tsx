import { fireEvent, render, screen, within } from '@testing-library/react';
import { CourseCatalogue } from '../../course-app/CourseCatalogue';
import type { MemberCourse } from '../../course-app/member-api';

const ids = ['ai-in-robotics', 'intro-to-robotics', 'robot-actuators', 'computation-structures', 'embedded-firmware', 'maths-ai', 'pic-microcontrollers', 'manual-lathe', 'manual-milling'];
const courses: MemberCourse[] = ids.map(id => ({ id, versionId: `${id}-current`, title: `${id} full title`, description: `Published ${id} description`, moduleCount: 7, lessonCount: 35, accessTier: 'free', requiresVerifiedMembership: id === 'manual-lathe', finalAssessmentRoute: 'unassigned', labPolicyStatus: 'unassigned', canLearn: false, enrolled: false, readCount: 0, resumeLessonId: null, lastBlock: 0, coverUrl: `https://media.armatureailabs.com/covers/v1/${id}-1600.webp` }));
const catalogue = () => within(screen.getByRole('region', { name: 'Explore all courses' }));

it('renders the complete API catalogue and the selected featured courses', () => {
  render(<CourseCatalogue courses={courses} onOpenCourse={vi.fn()} />);
  expect(catalogue().getAllByRole('heading', { level: 3 })).toHaveLength(9);
  expect(within(screen.getByRole('region', { name: 'Featured courses' })).getAllByRole('heading', { level: 3 })).toHaveLength(3);
  expect(catalogue().getByRole('status')).toHaveTextContent('9 courses');
  expect(catalogue().getByText('Free · verified members')).toBeInTheDocument();
  expect(catalogue().getAllByText('7 modules · 35 lessons')).toHaveLength(9);
});

it('combines subject and search filters, and resets an empty result', () => {
  render(<CourseCatalogue courses={courses} onOpenCourse={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Workshop' }));
  expect(catalogue().getAllByRole('heading', { level: 3 })).toHaveLength(2);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'lathe' } });
  expect(catalogue().getByRole('status')).toHaveTextContent('1 course');
  expect(catalogue().getByRole('heading', { name: 'Manual Lathe' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no match' } });
  expect(catalogue().getByRole('status')).toHaveTextContent('0 courses');
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(screen.getByRole('searchbox')).toHaveValue('');
  expect(catalogue().getByRole('status')).toHaveTextContent('9 courses');
  expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
});

it('uses current versions from the API for navigation and removes withdrawn items on refresh', () => {
  const open = vi.fn();
  const view = render(<CourseCatalogue courses={courses} onOpenCourse={open} />);
  const updated = { ...courses[0], versionId: 'newly-published-version', moduleCount: 40, lessonCount: 240 };
  view.rerender(<CourseCatalogue courses={[updated]} onOpenCourse={open} />);
  const link = catalogue().getByRole('link', { name: 'View course' });
  expect(link).toHaveAttribute('href', '/?version=newly-published-version');
  expect(catalogue().getByText('40 modules · 240 lessons')).toBeInTheDocument();
  fireEvent.click(link);
  expect(open).toHaveBeenCalledWith(updated);
  expect(catalogue().getByRole('status')).toHaveTextContent('1 course');
  expect(catalogue().queryByText('Manual Lathe')).not.toBeInTheDocument();
});

it('does not hide a new course outside the curated subject list or invent free access', () => {
  const future: MemberCourse = { ...courses[0], id: 'future-course', title: 'Future controls', description: 'Published course description', accessTier: 'paid' };
  render(<CourseCatalogue courses={[future]} onOpenCourse={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Other' }));
  expect(catalogue().getByRole('heading', { name: 'Future controls' })).toBeInTheDocument();
  expect(catalogue().getByText('Course entitlement required')).toBeInTheDocument();
  expect(catalogue().getByText('Published course description')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Featured courses' })).not.toBeInTheDocument();
});

it('handles a catalogue with no published courses without offering a stale course', () => {
  render(<CourseCatalogue courses={[]} onOpenCourse={vi.fn()} />);
  expect(screen.getByText('No courses are published yet.')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'View course' })).not.toBeInTheDocument();
});


it('keeps older enrolled versions in My courses rather than duplicating the discovery catalogue', () => {
  const current = courses[0];
  const older = { ...current, versionId: 'older-enrolled-version', enrolled: true };
  render(<CourseCatalogue courses={[current, older]} onOpenCourse={vi.fn()} />);
  expect(catalogue().getByRole('status')).toHaveTextContent('1 course');
  expect(catalogue().getByRole('link', { name: 'View course' })).toHaveAttribute('href', `/?version=${current.versionId}`);
});
