// Thin re-export — the admin panel now lives in components/admin/ as
// several focused files instead of one 2,178-line file. This path stays so
// App.tsx's import doesn't need to change. See the redesign plan for the
// rationale and file breakdown.
export { Admin } from '../admin/index';
export { Admin as default } from '../admin/index';
