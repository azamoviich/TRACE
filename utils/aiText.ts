// Renders the small markdown subset AI replies use (headings, **bold**,
// *italic*, bullet/numbered lists, --- rules) as HTML. Text is HTML-escaped
// first, so model output can never inject markup into the page.
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderAiMarkdown(text: string): string {
  return escapeHtml(text.trim())
    .replace(/^-{3,}\s*$/gm, '')
    .replace(/^#{1,6}\s+(.+)$/gm, '<span style="display:block;margin-top:10px;font-weight:600;color:var(--color-text, inherit)">$1</span>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
    .replace(/^\s*[-•]\s+(.+)$/gm, '<span style="display:flex;gap:6px"><span style="color:#ff6b35;flex-shrink:0">•</span><span>$1</span></span>')
    .replace(/^\s*\d+\.\s+(.+)$/gm, '<span style="display:flex;gap:6px"><span style="color:#ff6b35;flex-shrink:0">→</span><span>$1</span></span>')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n/g, '<br/>');
}
