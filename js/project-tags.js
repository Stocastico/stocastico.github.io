/* The project facet vocabulary — the single copy.
 
   It lives in js/ rather than in data/ because three consumers need it and one
   of them is js/render-cards.js, which js/main.js imports statically. A data
   module imported from there lands in the eager bundle of all 21 pages, which
   is the rule the six data/*.js modules were moved behind dynamic import() to
   satisfy. Six labels and six slugs are a few hundred bytes; data/projects.js
   is not. data/projects.js re-exports these so the vocabulary still documents
   itself next to the data it describes.

   Why the vocabulary is closed at all, and why a facet needs two projects
   before it may exist, is in the header of data/projects.js. */

/* Chip order on projects.html. `label` is what a project's `tags` entry says
   and what its card badge shows; `slug` is what data-tags and data-filter
   carry, since a label with a space and an ampersand in it makes a poor
   attribute value. */
export const PROJECT_TAGS = [
  { slug: 'computer-vision',    label: 'Computer Vision' },
  { slug: 'ar-3d',              label: 'AR & 3D' },
  { slug: 'llms-mlops',         label: 'LLMs & MLOps' },
  { slug: 'media-live-events',  label: 'Media & Live Events' },
  { slug: 'education-research', label: 'Education & Research' },
  { slug: 'data-interactive',   label: 'Data & Interactive' },
];

export const PROJECT_TAG_SLUGS = new Map(PROJECT_TAGS.map((t) => [t.label, t.slug]));

/* Labels -> slugs. An unknown label is DROPPED rather than slugified on the
   fly: test/project-tags.test.mjs already fails on a stray, and inventing a
   slug for one would ship a facet that no chip can ever select — a card
   filtered out of every view including, eventually, the one it belongs to. */
export function tagSlugsFor(tags) {
  if (!Array.isArray(tags)) return [];
  const out = [];
  for (const label of tags) {
    const slug = PROJECT_TAG_SLUGS.get(label);
    if (slug && out.indexOf(slug) === -1) out.push(slug);
  }
  return out;
}
