import { ArrowUpRight } from 'lucide-react';
import './talentCommunity.css';

const groups = {
  engineers: { name: 'Robotics engineers', description: 'Connect with engineers building physical systems.', url: 'https://chat.whatsapp.com/Ht2FNkxuutA5wRuOtJaywD?mode=gi_t' },
  students: { name: 'Students and Grads: Early career', description: 'Meet peers and explore paths into robotics.', url: 'https://chat.whatsapp.com/HFZ9nLe0V9cKiu79E3w5aL?mode=gi_t' },
  jobs: { name: 'Hiring and Jobs', description: 'Connect around opportunities and hiring.', url: 'https://chat.whatsapp.com/BQNth0c5K8TK77KqEUjixg?mode=gi_t' },
  leaders: { name: 'CXOs in robotics', description: 'Connect with leaders in the robotics ecosystem.', url: 'https://chat.whatsapp.com/BVVZPe3eiDx6VdHO96afoS?mode=gi_t' },
};

export function TalentCommunityLink({ group }: { group: keyof typeof groups }) {
  const item = groups[group];
  return <a href={item.url} target="_blank" rel="noopener noreferrer" className="talent-community-link">{item.name} on WhatsApp <ArrowUpRight size={14} aria-hidden="true"/></a>;
}

export function TalentCommunity() {
  return <section className="talent-community" aria-labelledby="talent-community-heading">
    <div><p className="eyebrow">The community</p><h2 id="talent-community-heading">Physical AI and Robotics Club by Armature AI Labs</h2><p>Find your group and continue the conversation on WhatsApp.</p></div>
    <div className="talent-community-grid">{Object.entries(groups).map(([key, group]) => <div key={key}><h3>{group.name}</h3><p>{group.description}</p><TalentCommunityLink group={key as keyof typeof groups}/></div>)}</div>
    <p className="fine">These links open WhatsApp. Joining a group does not claim or verify your Talent Network profile. Group members may be able to see your phone number and WhatsApp profile.</p>
  </section>;
}
