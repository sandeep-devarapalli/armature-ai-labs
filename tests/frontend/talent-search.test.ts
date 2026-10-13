import { describe, expect, it } from 'vitest';
import { buildDirectoryIndex, searchDirectory, type DirectoryPerson, type DirectoryQuery } from '../../src/features/talent/directorySearch';
import { onboardingAuthReturnPath } from '../../src/lib/authReturnPath';

const person = (id: string, fields: Partial<DirectoryPerson>): DirectoryPerson => ({
  id, name: id, title: '', headline: '', company: '', previousCompanies: [], location: '',
  yearsExperience: null, skills: [], physicalAiAreas: [], summary: '', checkedAt: '2026-10-13',
  linkedinUrl: `https://www.linkedin.com/in/synthetic-${id}`, claimed: false, ...fields,
});
const index = buildDirectoryIndex([
  person('a', { name: 'Sample Anya', title: 'Firmware Engineer', headline: 'UAV flight controllers', company: 'Sample Circuits', previousCompanies: ['Sample Instruments'], location: 'Bangalore, Karnataka, India', skills: ['Embedded'], physicalAiAreas: ['Drones'] }),
  person('b', { name: 'Sample Bharat', title: 'Robotics Software Engineer', headline: 'ROS 2 navigation', company: 'Sample Circuits', location: 'Bengaluru, Karnataka, India', skills: ['SLAM'], physicalAiAreas: ['Navigation'] }),
  person('c', { name: 'Sample Chen', title: 'Account Manager', company: 'Drone Robotics', previousCompanies: ['Embedded Systems'], location: 'Chennai, Tamil Nadu, India' }),
  person('d', { name: 'Sample Devi', title: 'Embedded Engineer', company: 'Sample Devices', location: 'Pune, Maharashtra, India', skills: ['Embedded'] }),
]);
function search(query: string, filters: Partial<DirectoryQuery> = {}) {
  return searchDirectory(index, { query, location: '', category: '', company: '', sort: 'relevance', ...filters });
}
const ids = (query: string, filters: Partial<DirectoryQuery> = {}) => search(query, filters).map(result => result.person.id);

describe('talent directory search with synthetic people', () => {
  it('finds names and current or previous companies with explicit evidence', () => {
    expect(ids('sample anya')).toEqual(['a']);
    expect(ids('Sample Circuits')).toEqual(['a', 'b']);
    expect(search('Sample Instruments')[0].matches).toContain('Previous company: Sample Instruments');
  });
  it('matches title aliases and ROS 2 spelling', () => {
    expect(ids('embedded engineers')).toEqual(['a', 'd']);
    expect(ids('firmware')).toEqual(['a', 'd']);
    expect(ids('ROS2')).toEqual(['b']);
    expect(ids('ROS 2')).toEqual(['b']);
  });
  it('requires every capability in a combined natural-language query', () => {
    expect(ids('I want to find embedded engineers who have worked in drones')).toEqual(['a']);
    expect(ids('SLAM navigation')).toEqual(['b']);
    expect(ids('embedded SLAM')).toEqual([]);
  });
  it('treats Bangalore and Bengaluru as the same location filter', () => {
    expect(ids('', { location: 'Bangalore' })).toEqual(['a', 'b']);
    expect(ids('', { location: 'bengaluru' })).toEqual(['a', 'b']);
    expect(ids('Bangalore')).toEqual(['a', 'b']);
  });
  it('does not infer technical experience from employers but permits exact company lookup', () => {
    expect(ids('drone')).toEqual(['a']);
    expect(ids('robotics')).toEqual(['b']);
    expect(ids('embedded drone')).toEqual(['a']);
    expect(ids('Drone Robotics')).toEqual(['c']);
    expect(search('Drone Robotics')[0].matches).toContain('Company: Drone Robotics');
  });
  it('combines explicit category, company and location filters', () => {
    expect(ids('', { category: 'embedded', company: 'sample circuits', location: 'bengaluru' })).toEqual(['a']);
    expect(ids('', { category: 'Embedded', location: 'Pune, Maharashtra, India' })).toEqual(['d']);
    expect(ids('', { company: 'Sample Instruments' })).toEqual([]);
  });
  it('returns stable name order for an empty query and no matches for absent terms', () => {
    expect(ids('', { sort: 'name' })).toEqual(['a', 'b', 'c', 'd']);
    expect(ids('nonexistent-specialization')).toEqual([]);
    expect(searchDirectory(buildDirectoryIndex([]), { query: '', location: '', category: '', company: '', sort: 'name' })).toEqual([]);
  });
});

describe('talent sign-in return paths', () => {
  it('preserves profile and review hashes during basic onboarding', () => {
    expect(onboardingAuthReturnPath('/talent-network/#profile/a', true)).toBe('/talent-network/#profile/a');
    expect(onboardingAuthReturnPath('/talent-network?source=claim#profile/a', true)).toBe('/talent-network?source=claim#profile/a');
    expect(onboardingAuthReturnPath('/talent-network/#review', true)).toBe('/talent-network/#review');
  });
  it('does not extend the exception to external or lookalike routes', () => {
    expect(onboardingAuthReturnPath('//other.example/talent-network/', true)).toBe('/onboarding');
    expect(onboardingAuthReturnPath('/talent-network-other/#profile/a', true)).toBe('/onboarding');
    expect(onboardingAuthReturnPath('/admin/talent-network/', true)).toBe('/onboarding');
  });
});
