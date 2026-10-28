import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

declare const __COURSES_LOCAL_PREVIEW__: boolean;
declare const __COURSES_MEMBER_APP__: boolean;
const root = ReactDOM.createRoot(document.getElementById('root')!);
if (__COURSES_MEMBER_APP__) {
  import('./MemberApp').then(({ default: App }) => root.render(<React.StrictMode><App /></React.StrictMode>));
} else if (__COURSES_LOCAL_PREVIEW__) {
  import('./App').then(({ default: App }) => root.render(<React.StrictMode><App /></React.StrictMode>));
} else {
  root.render(<main className="disabled-preview"><h1>Armature Courses</h1><p>This preview is available only on the local development server. The member learning platform is not published.</p></main>);
}
