import { Link } from "react-router-dom";
import { hackathonPath, hackathons, humanoidChallenge2026, type Hackathon } from "../data/hackathons";
import "./HackathonPages.css";

function Crumb({ hackathon }: { hackathon?: Hackathon }) {
  return <nav className="hackathon-crumb" aria-label="Breadcrumb">
    <Link to="/resources">Resources</Link><span aria-hidden="true">/</span>
    {hackathon ? <><Link to="/resources/hackathons">Hackathons</Link><span aria-hidden="true">/</span><span>{hackathon.tagline}</span></> : <span>Hackathons</span>}
  </nav>;
}

export function HackathonsPage() {
  return <article className="wrap hackathon-page">
    <Crumb />
    <h1 className="hackathon-index-title">Hackathons</h1>
    <p className="hackathon-index-lede">Build challenges in physical AI and robotics, run by Armature AI Labs with partners. Each one gets a page with the brief, how it was judged and the strongest submissions.</p>
    <ul className="hackathon-index" aria-label="Hackathons">
      {hackathons.map((hackathon) => (
        <li key={hackathon.slug}>
          <img src={hackathon.builds[0].image.src} alt="" width={hackathon.builds[0].image.width} height={hackathon.builds[0].image.height} loading="lazy" />
          <div>
            <p className="hackathon-label">{hackathon.dates} · {hackathon.format}</p>
            <h2>{hackathon.name}</h2>
            <p>{hackathon.stats[0].value} {hackathon.stats[0].label}, {hackathon.stats[1].value} submissions. See the top {hackathon.builds.length} builds.</p>
            <Link to={hackathonPath(hackathon)}>See the results →</Link>
          </div>
        </li>
      ))}
    </ul>
  </article>;
}

export function HackathonPage({ hackathon = humanoidChallenge2026 }: { hackathon?: Hackathon }) {
  return <article className="wrap hackathon-page">
    <Crumb hackathon={hackathon} />
    <section className="hackathon-hero" aria-labelledby="hackathon-title">
      <div>
        <p className="hackathon-label">Hackathon results · {hackathon.dates} · {hackathon.format}</p>
        <h1 id="hackathon-title">{hackathon.name}</h1>
        <p className="hackathon-lede">{hackathon.lede}</p>
        <div className="hackathon-actions">
          <a className="hackathon-button" href="#builds">See the top builds</a>
          <a href={hackathon.lumaUrl} target="_blank" rel="noreferrer">Read the original brief on Luma <span aria-hidden="true">↗</span></a>
        </div>
      </div>
      <dl className="hackathon-hosts">
        <dt>Hosted by</dt><dd>{hackathon.hosts}</dd>
        <dt>Prize</dt><dd>{hackathon.prize}</dd>
      </dl>
    </section>

    <ul className="hackathon-stats" aria-label="By the numbers">
      {hackathon.stats.map((stat) => <li key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></li>)}
    </ul>

    <section className="hackathon-context">
      <h2>The brief</h2>
      <div>
        <p>{hackathon.brief}</p>
        <p className="hackathon-rule"><strong>One hard rule.</strong> {hackathon.hardRule}</p>
      </div>
    </section>

    <section className="hackathon-context">
      <h2>How we judged</h2>
      <div>
        <ol className="hackathon-criteria">
          {hackathon.criteria.map((criterion, index) => <li key={criterion.title}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{criterion.title}</strong><p>{criterion.text}</p></div></li>)}
        </ol>
        <p className="hackathon-note">{hackathon.evaluationNote}</p>
      </div>
    </section>

    <section id="builds" className="hackathon-builds" aria-labelledby="builds-title">
      <p className="hackathon-label">Top submissions</p>
      <h2 id="builds-title">{hackathon.buildsHeading}</h2>
      {hackathon.builds.map((build, index) => (
        <article className="hackathon-build" key={build.slug} aria-labelledby={`build-${build.slug}`}>
          <a className="hackathon-media" href={build.videoUrl} target="_blank" rel="noreferrer">
            <img src={build.image.src} alt={build.image.alt} width={build.image.width} height={build.image.height} loading={index < 2 ? "eager" : "lazy"} style={build.image.position ? { objectPosition: build.image.position } : undefined} />
            <span className="hackathon-watch"><span aria-hidden="true">▶</span> {build.videoLabel}</span>
          </a>
          <div className="hackathon-build-body">
            <p className="hackathon-rank">{String(index + 1).padStart(2, "0")}</p>
            <h3 id={`build-${build.slug}`}>{build.title}</h3>
            <p className="hackathon-builder">{build.builder} · {build.institution}</p>
            <p className="hackathon-metric"><strong>{build.metric}</strong><span>{build.metricLabel}</span></p>
            <dl>
              <dt>Task</dt><dd>{build.task}</dd>
              <dt>Robot</dt><dd>{build.robot}</dd>
              <dt>Their data</dt><dd>{build.data}</dd>
              <dt>Approach</dt><dd>{build.approach}</dd>
            </dl>
            <a href={build.repoUrl} target="_blank" rel="noreferrer">Code and write-up on GitHub <span aria-hidden="true">↗</span></a>
          </div>
        </article>
      ))}
    </section>

    <section className="hackathon-context hackathon-partners">
      <h2>Organised with</h2>
      <ul>
        {hackathon.partners.map((partner) => <li key={partner.name}><strong>{partner.name}</strong><span>{partner.text}</span></li>)}
      </ul>
    </section>
  </article>;
}
