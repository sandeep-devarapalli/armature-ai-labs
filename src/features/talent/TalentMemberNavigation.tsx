import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { talentRpc, type TalentRequest } from './liveTalent';
import { type ProfileSubmission, useSubmissionAccount } from './TalentAddProfile';

export function useTalentMember(route: string) {
  const account = useSubmissionAccount();
  const [profile, setProfile] = useState<{ userId: string; ownerId?: string; published?: boolean; started: boolean } | null>(null);
  const [error, setError] = useState('');
  const userId = account.user?.id;
  const confirmed = Boolean(account.user?.email_confirmed_at);
  useEffect(() => {
    let alive = true;
    setError('');
    if (userId && confirmed) void (async () => {
      try {
        const [requests, submissions, owner] = await Promise.all([
          talentRpc<TalentRequest[]>('talent_my_requests'),
          talentRpc<ProfileSubmission[]>('talent_my_submissions'),
          talentRpc<{ id: string; published: boolean } | null>('talent_my_profile'),
        ]);
        if (alive) setProfile({ userId, ownerId: owner?.id, published: owner?.published, started: submissions.length > 0 || requests.some(r => r.kind === 'claim') });
      } catch { if (alive) setError('Unable to check your profile. Open My profile to review your updates.'); }
    })();
    return () => { alive = false; };
  }, [userId, confirmed, route]);
  return { ...account, profile: profile?.userId === userId ? profile : null, profileError: error };
}

export function TalentMemberNavigation({ route, signedIn, isAdmin, unread, profileLabel }: { route: string; signedIn: boolean; isAdmin: boolean; unread: number; profileLabel: string }) {
  return <nav className="talent-section-nav" aria-label="Talent network navigation">
    <a href="#talent" aria-current={route === 'talent' || !route || route.startsWith('profile/') ? 'page' : undefined}>Find talent</a>
    <a href="#work" aria-current={route === 'work' ? 'page' : undefined}>Find work</a>
    {signedIn && <>
      <a href="#messages" aria-current={route.startsWith('messages') ? 'page' : undefined}>Messages{unread > 0 ? ` (${unread})` : ''}</a>
      <a href="#projects" aria-current={route === 'projects' ? 'page' : undefined}>My projects</a>
      {isAdmin && <><a href="#review">Review profiles</a><a href="#market-review">Review work</a></>}
      <div className="talent-member-actions">
        <a className="button primary" href={profileLabel === 'Add my profile' ? '#add-profile' : profileLabel === 'Edit my profile' ? '#edit-profile' : '#my-profile'}><UserRound size={16} aria-hidden="true"/>{profileLabel}</a>
        <a className="button" href="#post">Post a requirement</a>
      </div>
    </>}
  </nav>;
}
