import type { TalentPortfolioProject } from './directorySearch';
import './talentPortfolio.css';

export function safePortfolioUrl(value: string): string | undefined {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}

export function PortfolioFields({ projects, onChange, disabled }: { projects: TalentPortfolioProject[]; onChange: (projects: TalentPortfolioProject[]) => void; disabled: boolean }) {
  const update = (index: number, patch: Partial<TalentPortfolioProject>) => onChange(projects.map((project, i) => i === index ? { ...project, ...patch } : project));
  return <fieldset className="talent-portfolio-editor edit-wide" disabled={disabled}><legend>Projects and personal contributions</legend><p className="fine">Show what you personally built. Add public evidence you have permission to share; never include confidential files or private contact details. Up to 10 projects.</p>
    {projects.map((project, index) => <fieldset key={index} className="talent-portfolio-fields"><legend>Project {index + 1}</legend>
      <label>Project title<input required maxLength={200} value={project.title} onChange={e => update(index, { title: e.target.value })}/></label>
      <label>Project summary<textarea required maxLength={1200} rows={2} value={project.summary} onChange={e => update(index, { summary: e.target.value })}/></label>
      <label>Your individual contribution<textarea required maxLength={1200} rows={3} value={project.contribution} onChange={e => update(index, { contribution: e.target.value })}/></label>
      <label>Skills used (one per line, maximum 20)<textarea rows={2} value={project.skills.join('\n')} onChange={e => update(index, { skills: e.target.value.split('\n') })}/></label>
      <label>Public evidence link (optional, HTTPS)<input type="url" pattern="https://.*" maxLength={1000} value={project.evidenceUrl} onChange={e => update(index, { evidenceUrl: e.target.value })} placeholder="https://github.com/…"/></label>
      <button type="button" onClick={() => onChange(projects.filter((_, i) => i !== index))}>Remove project {index + 1}</button>
    </fieldset>)}
    <button type="button" disabled={disabled || projects.length >= 10} onClick={() => onChange([...projects, { title: '', summary: '', contribution: '', skills: [], evidenceUrl: '' }])}>Add project</button>
  </fieldset>;
}

export function TalentPortfolio({ projects }: { projects?: TalentPortfolioProject[] }) {
  return <section className="profile-section talent-portfolio"><h2>Projects</h2>{!projects?.length ? <p>Not provided. No portfolio claims have been verified.</p> : <><p className="fine">Profile-contributor supplied · not independently verified. Project skills describe the stated contribution, not a platform assessment.</p>{projects.map((project, index) => <article key={index}><h3>{project.title}</h3><p className="profile-copy">{project.summary}</p><h4>Individual contribution</h4><p className="profile-copy">{project.contribution}</p>{project.skills.length > 0 && <p><strong>Skills used:</strong> {project.skills.join(' · ')}</p>}{safePortfolioUrl(project.evidenceUrl) && <a href={safePortfolioUrl(project.evidenceUrl)} target="_blank" rel="noopener noreferrer">View project evidence ↗</a>}</article>)}</>}</section>;
}
