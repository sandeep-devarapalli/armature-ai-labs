export interface CourseLocation { version: string | null; lessonId: string | null; myCourses: boolean; labReviews?: boolean }

export function readCourseLocation(search = window.location.search): CourseLocation {
  const params = new URLSearchParams(search);
  const valid = (value: string | null) => value && /^[a-zA-Z0-9-]{1,128}$/.test(value) ? value : null;
  const version = valid(params.get('version'));
  return { version, lessonId: version ? valid(params.get('lesson')) : null, myCourses: !version && params.get('view') === 'my', labReviews: !version && params.get('view') === 'labs' };
}

export function courseLocationUrl(location: CourseLocation) {
  const params = new URLSearchParams();
  if (location.version) {
    params.set('version', location.version);
    if (location.lessonId) params.set('lesson', location.lessonId);
  } else if (location.myCourses) params.set('view', 'my');
  else if (location.labReviews) params.set('view', 'labs');
  return `/${params.size ? `?${params}` : ''}`;
}
