import { Link } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import "./AboutPages.css";

export function AboutPage() {
  const { theme } = useTheme();
  const imageTheme = theme === "dark" ? "dark" : "light";

  return (
    <div className="about-page">
      <header className="about-hero">
        <div className="wrap about-hero-grid">
          <div className="about-hero-copy">
            <h1>Who<br />We Are</h1>
            <p>Armature AI Labs is a makers’ lab where people learn to build, test and share physical AI.</p>
          </div>
          <figure className="about-hero-figure">
            <div className="about-hero-labels mono" aria-hidden="true">
              <span>Build benches</span><span>Robotics cell</span><span>Local compute</span><span>Demo area</span>
            </div>
            <img
              src={`/about/lab-${imageTheme}.webp`}
              width="1774"
              height="887"
              alt="Conceptual axonometric drawing of a shared physical AI lab with benches, robotics, compute and demo areas"
              fetchPriority="high"
            />
            <figcaption>Concept illustration · not a completed Armature AI Labs facility.</figcaption>
          </figure>
        </div>
      </header>

      <section className="about-process" aria-labelledby="about-process-title">
        <div className="wrap">
          <h2 id="about-process-title" className="sr-only">How the lab comes together</h2>
          <img
            className="about-process-art"
            src="/about/learn-build-gather.webp"
            width="2172"
            height="724"
            alt="Conceptual line illustration of people learning, building and gathering in a shared lab"
            loading="lazy"
          />
          <div className="about-process-grid">
            <article>
              <div className="about-process-mobile-art about-process-mobile-art-learn" aria-hidden="true" />
              <h3>Learn</h3>
              <p>Hands-on training for young builders, undergraduates, graduates and hobbyists.</p>
            </article>
            <article>
              <div className="about-process-mobile-art about-process-mobile-art-build" aria-hidden="true" />
              <h3>Build</h3>
              <p>Shared tools and planned local compute for testing AI in hardware, benchmarking and prototyping.</p>
            </article>
            <article>
              <div className="about-process-mobile-art about-process-mobile-art-gather" aria-hidden="true" />
              <h3>Gather</h3>
              <p>Co-working, demos, workshops and guidance for builders developing startups.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="about-values" aria-labelledby="about-values-title">
        <div className="wrap about-values-grid">
          <h2 id="about-values-title">What we<br />stand for</h2>
          <ol>
            <li>Learn with your hands.</li>
            <li>Make tools useful to more builders.</li>
            <li>Work in good company.</li>
            <li>Show what you build.</li>
          </ol>
        </div>
      </section>

      <section className="about-ambition" aria-labelledby="about-ambition-title">
        <div className="wrap about-ambition-grid">
          <div>
            <h2 id="about-ambition-title">Our ambition is to bring this kind of lab to Tier 1 and Tier 2 cities across India.</h2>
            <p>More builders should have a place to learn, find collaborators and test physical AI close to home.</p>
          </div>
          <figure>
            <img
              src={`/about/india-future-${imageTheme}.webp`}
              width="1254"
              height="1254"
              alt="Illustrative map of India with proposed future lab connections shown as open circles"
              loading="lazy"
            />
            <figcaption>Future ambition · routes and locations are illustrative.</figcaption>
          </figure>
        </div>
      </section>

      <div className="about-team-handoff">
        <Link className="wrap" to="/team"><span>Meet the Team</span><span aria-hidden="true">↗</span></Link>
      </div>
    </div>
  );
}

export function TeamPage() {
  return (
    <div className="team-page">
      <header className="wrap team-hero">
        <h1>Meet the Team</h1>
        <p>The people behind Armature AI Labs will be introduced here as their profiles are ready.</p>
      </header>
      <section className="team-interim">
        <div className="wrap">
          <p>People make the lab.</p>
          <img src="/about/learn-build-gather.webp" width="2172" height="724" alt="Illustrative line drawing of builders learning, making and gathering" />
          <Link to="/about">Who We Are <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </div>
  );
}
