import { Link, useLocation } from "react-router-dom";
import "./WhitePaperPage.css";

const base = "/resources/white-paper/robotic-actuators";

export function WhitePaperPage() {
  const { pathname } = useLocation();
  if (pathname.replace(/\/$/, "") !== base) {
    const resources = pathname.replace(/\/$/, "") === "/resources";
    return <article className="wrap actuator-publication">
      <nav className="publication-crumb" aria-label="Breadcrumb"><Link to="/">The lab</Link><span>/</span><Link to="/resources">Resources</Link>{!resources && <><span>/</span><span>White Paper</span></>}</nav>
      <h1>{resources ? "Resources" : "White Paper"}</h1>
      <p>Research and engineering references from Armature AI Labs.</p>
      <section className="publication-context"><h2>{resources ? "White Paper" : "Robotic actuators"}</h2><div><p>Explore actuator technologies, innovation opportunities and manufacturing in India, with a separate specification comparison covering 24 actuator entries.</p><Link to={resources ? "/resources/white-paper" : base}>{resources ? "Browse white papers" : "Explore robotic actuators"} →</Link></div></section>
      {resources && <p><Link to="/ecosystem#builder-resources">Tools &amp; resources for builders</Link></p>}
    </article>;
  }
  return <article className="wrap actuator-publication">
    <nav className="publication-crumb" aria-label="Breadcrumb"><Link to="/resources">Resources</Link><span>/</span><Link to="/resources/white-paper">White Paper</Link><span>/</span><span>Robotic Actuators</span></nav>
    <section className="publication-hero">
      <div>
        <p className="publication-label">White paper · 25 October 2026</p>
        <h1>Robotic actuators</h1>
        <p className="publication-lede">Technology, innovation and manufacturing in India. A research paper on what robots use today, what limits performance, and how to build a competitive Indian joint.</p>
        <div className="publication-actions"><a className="publication-button" href={`${base}/white-paper.html`}>Read white paper <span aria-hidden="true">↗</span></a><a href={`${base}/robotic-actuators-india-white-paper.pdf`} download>Download PDF</a></div>
        <div className="publication-facts"><span>69 pages</span><span>104 references</span><span>Engineering + business</span></div>
        <p className="publication-note"><Link to={`${base}/feedback?document=robotic-actuators-white-paper`}>Comment or suggest a correction</Link></p>
      </div>
      <figure className="publication-cover">
        <img className="publication-art" src={`${base}/inside-the-joint.png`} width="1086" height="1448" alt="Inside the joint: an editorial illustration of an exploded robotic actuator" />
        <figcaption><img src="/brand/editorial-2026-09/logos/lockup-light-transparent-1140.svg" alt="Armature AI Labs" /><strong>Robotic actuators</strong><span>Technology, innovation and<br />manufacturing in India</span></figcaption>
      </figure>
    </section>
    <section className="publication-companion">
      <div><p className="publication-label">Companion reference</p><div className="publication-fields"><span>Mass</span><span>Torque</span><span>Thermal</span><span>Origin</span></div></div>
      <div><h2>Actuator specifications</h2><p>Compare 24 Indian and Chinese actuator entries. Inspect weight, torque, speed, sensing, temperature limits and sourcing evidence in a separate specification table.</p><p><Link to={`${base}/feedback?document=actuator-specifications`}>Comment or suggest a correction</Link></p></div>
      <a className="publication-button" href={`${base}/actuator-specifications.html`}>Compare actuators <span aria-hidden="true">↗</span></a>
    </section>
    <section className="publication-context"><h2>Read with the evidence</h2><div><p>The paper explains technologies, limitations, innovation opportunities and the Indian supply chain. The specifications reference supports component comparison. Both distinguish published claims, calculations, proposed targets and unknowns.</p><p className="publication-note">Cover artwork is an AI-generated editorial illustration, not a tested actuator design.</p><Link to="/ecosystem#builder-resources">Tools &amp; resources for builders</Link></div></section>
  </article>;
}
