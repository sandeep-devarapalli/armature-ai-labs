import { useState, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { CoverImage } from './CoverImage';
import { courseLocationUrl } from './course-location';
import type { CatalogueCourse } from './member-api';
import './catalogue.css';

const editorial: Record<string, { subject: string; title: string; summary: string }> = {
  'ai-in-robotics': { subject: 'Robotics', title: 'Artificial Intelligence in Robotics', summary: 'Explore robot geometry, control, learning, perception and planning through worked examples.' },
  'intro-to-robotics': { subject: 'Robotics', title: 'Introduction to Robotics', summary: 'Discover how robot joints, motors, sensors and control work together. Start with everyday observations.' },
  'robot-actuators': { subject: 'Robotics', title: 'Robot Actuators', summary: 'Understand torque, motors, gearing, mechanical design and joint control.' },
  'computation-structures': { subject: 'Computing', title: 'Computation Structures', summary: 'Follow the computer design hierarchy from logic gates to processors and memory.' },
  'embedded-firmware': { subject: 'Computing', title: 'Embedded Firmware Fundamentals', summary: 'Learn firmware, drivers, debugging, motor control and real-time systems.' },
  'maths-ai': { subject: 'Mathematics', title: 'Mathematics Foundations for AI', summary: 'Build foundations in linear algebra, calculus, probability and information theory.' },
  'pic-microcontrollers': { subject: 'Computing', title: 'PIC Microcontrollers', summary: 'Work through PIC pins, registers, instructions, timing and interrupts.' },
  'manual-lathe': { subject: 'Workshop', title: 'Manual Lathe', summary: 'Learn turning principles, workholding, measurement and process planning before supervised use.' },
  'manual-milling': { subject: 'Workshop', title: 'Manual Milling', summary: 'Understand tooling, workholding, cutting calculations, slots, holes and setup reasoning.' },
};
const featuredIds = ['ai-in-robotics', 'intro-to-robotics', 'robot-actuators'];
const subjects = ['All', 'Robotics', 'Computing', 'Mathematics', 'Workshop'];
const metadata = (course: CatalogueCourse) => editorial[course.id] ?? { subject: 'Other', title: course.title, summary: course.description };

export function CourseCatalogue<T extends CatalogueCourse>({ courses, onOpenCourse, headingRef, accessNotice }: {
  courses: T[];
  onOpenCourse?: (course: T) => void;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  accessNotice?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('All');
  const published = courses.filter((course, index) => courses.findIndex(item => item.id === course.id) === index);
  const featured = featuredIds.flatMap(id => published.filter(course => course.id === id));
  const hero = featured[0] ?? published[0];
  const visible = published.filter(course => {
    const item = metadata(course);
    return (subject === 'All' || item.subject === subject)
      && `${course.title} ${course.description} ${item.title} ${item.summary}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });
  function open(event: MouseEvent<HTMLAnchorElement>, course: T) {
    if (!onOpenCourse || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpenCourse(course);
  }
  function card(course: T) {
    const item = metadata(course);
    const href = courseLocationUrl({ version: course.versionId, lessonId: null, myCourses: false });
    return <article className="catalogue-card" key={course.versionId}>
      <a className="catalogue-cover" href={href} onClick={event => open(event, course)} aria-label={`View ${course.title}`}><CoverImage url={course.coverUrl} className="catalogue-cover-image" sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 1184px) 33vw, 358px" /></a>
      <div className="catalogue-card-body"><span className="catalogue-subject">{item.subject}</span><h3><a href={href} onClick={event => open(event, course)} title={course.title}>{item.title}</a></h3><p>{item.summary}</p>
        <span className="catalogue-size">{course.moduleCount} modules · {course.lessonCount} lessons</span>
        <div className="catalogue-card-bottom"><span>{course.accessTier === 'free' ? course.requiresVerifiedMembership ? 'Free · verified members' : 'Free course' : 'Course entitlement required'}</span><a className="catalogue-text-link" href={href} onClick={event => open(event, course)}>View course <ArrowRight aria-hidden="true" /></a></div>
      </div>
    </article>;
  }
  return <main className="course-catalogue wrap" id="main-content">
    <section className="catalogue-hero"><div><h1 ref={headingRef} tabIndex={-1}>Learn how intelligent machines work.</h1><p>Explore robotics, AI, computing and the craft of building physical systems.</p><a className="catalogue-button" href="#catalogue">Explore courses <ArrowRight aria-hidden="true" /></a></div>
      {hero ? <a className="catalogue-hero-cover" href={courseLocationUrl({ version: hero.versionId, lessonId: null, myCourses: false })} onClick={event => open(event, hero)}><CoverImage url={hero.coverUrl} className="catalogue-hero-image" sizes="(max-width: 700px) calc(100vw - 40px), 538px" eager /><span>{metadata(hero).title}<ArrowRight aria-hidden="true" /></span></a> : null}
    </section>
    {accessNotice}
    {featured.length ? <section className="catalogue-section" aria-labelledby="featured-heading"><div className="catalogue-section-title"><h2 id="featured-heading">Featured courses</h2><a className="catalogue-text-link" href="#catalogue">View all courses <ArrowRight aria-hidden="true" /></a></div><div className="catalogue-grid">{featured.map(card)}</div></section> : null}
    <section className="catalogue-section" id="catalogue" aria-labelledby="catalogue-heading"><div className="catalogue-section-title"><div><h2 id="catalogue-heading">Explore all courses</h2><p>Find a subject. Open a syllabus. Start with a sample lesson.</p></div><span className="catalogue-result-count" role="status">{visible.length} {visible.length === 1 ? 'course' : 'courses'}</span></div>
      <label className="catalogue-search"><Search aria-hidden="true" /><span className="sr-only">Search courses</span><input type="search" placeholder="What do you want to learn?" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="catalogue-filters" role="group" aria-label="Filter courses by subject">{[...subjects, ...(courses.some(course => !editorial[course.id]) ? ['Other'] : [])].map(value => <button key={value} aria-pressed={subject === value} onClick={() => setSubject(value)}>{value}</button>)}</div>
      <div className="catalogue-grid">{visible.map(card)}</div>
      {!visible.length ? <div className="catalogue-empty"><h3>{courses.length ? 'No courses match that search.' : 'No courses are published yet.'}</h3>{courses.length ? <><p>Try a different term or browse all subjects.</p><button className="catalogue-button" onClick={() => { setQuery(''); setSubject('All'); }}>Clear search</button></> : null}</div> : null}
    </section>
  </main>;
}
