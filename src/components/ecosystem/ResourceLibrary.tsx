import { ArrowRight, ArrowUpRight, BookOpen, Box, Cpu, LayoutGrid, Lightbulb, Link2, Search } from "lucide-react";
import { useRef, useState } from "react";
import { builderProjects, builderResources, resourceCategories, type ResourceCategoryId } from "../../data/builderResources";
import "./ResourceLibrary.css";

const icons = { all: LayoutGrid, electronics: Cpu, cad: Box, simulation: BookOpen, integrations: Link2, projects: Lightbulb };

export default function ResourceLibrary() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ResourceCategoryId>("all");
  const [limit, setLimit] = useState(4);
  const [projectId, setProjectId] = useState<string | null>(null);
  const projectTrigger = useRef<HTMLButtonElement | null>(null);
  const projectHeading = useRef<HTMLHeadingElement | null>(null);
  const search = query.trim().toLowerCase();
  const resources = builderResources.filter(resource => (category === "all" || resource.category === category)
    && `${resource.name} ${resource.summary} ${resourceCategories.find(item => item.id === resource.category)?.label}`.toLowerCase().includes(search));
  const project = builderProjects.find(item => item.id === projectId);
  function clearFilters() { setQuery(""); setCategory("all"); setLimit(4); }

  return <section id="builder-resources" className="resource-library" aria-labelledby="resource-library-title">
    <h2 id="resource-library-title">Tools &amp; resources for builders</h2>
    <p className="resource-library-intro">Practical tools for electronics, mechanical design and robotics.</p>
    <label className="resource-search"><Search aria-hidden="true" /><span className="sr-only">Search tools, workflows and resources</span>
      <input type="search" value={query} placeholder="Search tools, workflows and resources" onChange={event => { setQuery(event.target.value); setLimit(4); }} />
    </label>
    <div className="resource-layout">
      <nav className="resource-categories" aria-label="Explore resources by task"><strong>Explore by task</strong>
        <div>{resourceCategories.map(item => { const Icon = icons[item.id]; return <button key={item.id} aria-pressed={category === item.id} onClick={() => { setCategory(item.id); setLimit(4); }}><Icon aria-hidden="true" />{item.label}</button>; })}</div>
      </nav>
      <div className="resource-results">
        <p role="status" className="sr-only">{resources.length} resources found. Showing {Math.min(limit, resources.length)}.</p>
        {(query || category !== "all") && <button className="resource-text-button" onClick={clearFilters}>Clear filters</button>}
        <ul className="resource-list">{resources.slice(0, limit).map(resource => <li key={resource.id}>
          <h3>{resource.name}</h3><span className="resource-category">{resourceCategories.find(item => item.id === resource.category)?.label}</span>
          <div className="resource-summary"><p>{resource.summary}</p>{resource.caution && <small>{resource.caution}</small>}</div>
          <a href={resource.url} target="_blank" rel="noreferrer" aria-label={`Explore tool: ${resource.name}`}>Explore tool <ArrowUpRight aria-hidden="true" /></a>
        </li>)}</ul>
        {!resources.length && <p>No resources match your search. Try another task or clear the filters.</p>}
        {resources.length > limit && <button className="resource-text-button resource-more" onClick={() => setLimit(value => value + 8)}>Show more resources <ArrowRight aria-hidden="true" /></button>}
        <div className="resource-projects"><strong>Start with a small project</strong>{builderProjects.map(item => <button key={item.id} aria-expanded={projectId === item.id} aria-controls="resource-project-details" onClick={event => {
          projectTrigger.current = event.currentTarget; setProjectId(item.id);
          requestAnimationFrame(() => {
            projectHeading.current?.scrollIntoView({ block: "start" });
            projectHeading.current?.focus({ preventScroll: true });
          });
        }}>{item.name}<ArrowRight aria-hidden="true" /></button>)}</div>
        {project && <article id="resource-project-details" className="resource-project-detail" aria-labelledby="resource-project-title">
          <button className="resource-text-button" onClick={() => { setProjectId(null); projectTrigger.current?.focus(); }}>Back to resources</button>
          <h3 id="resource-project-title" ref={projectHeading} tabIndex={-1}>{project.name}</h3><p>{project.summary}</p>
          <ol>{project.steps.map(step => <li key={step}>{step}</li>)}</ol><p><strong>Human checks:</strong> {project.checks}</p>
          <div className="resource-project-links">{project.resourceIds.map(id => builderResources.find(item => item.id === id)).filter(item => item !== undefined).map(item => <a key={item.id} href={item.url} target="_blank" rel="noreferrer">{item.name}<ArrowUpRight aria-hidden="true" /></a>)}</div>
        </article>}
      </div>
    </div>
    <p className="resource-note">Check compatibility and review outputs before use. Tool descriptions are based on documentation, not hands-on benchmarks.</p>
  </section>;
}
