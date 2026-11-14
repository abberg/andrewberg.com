// Content collections. `advertising` holds the 2004–2014 advertising and marketing projects, one Markdown file each.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const advertising = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/advertising' }),
  schema: z.object({
    title: z.string(),
    client: z.string(),
    agency: z.string(),
    partners: z.array(z.string()).default([]),
    year: z.number(),
    role: z.string(),
    summary: z.string(),
    // Slug of a sketch package that recreates the piece, embedded on the project page when present.
    recreation: z.string().optional(),
    // A still of the original work shown large at the top of the project page, served from public/advertising/<project>/.
    hero: z.object({ src: z.string(), width: z.number(), height: z.number(), alt: z.string(), caption: z.string() }).optional(),
    // Stills of the original work, served from public/advertising/<project>/; one with an href links off to where it came from.
    images: z.array(z.object({ src: z.string(), width: z.number(), height: z.number(), alt: z.string(), caption: z.string(), href: z.string().url().optional() })).default([]),
    // A short note shown after the recreation, such as how the work lived offline.
    after: z.object({ text: z.string() }).optional(),
    // A film of the original work on YouTube.
    video: z.object({ youtube: z.string(), title: z.string(), caption: z.string() }).optional(),
    recognition: z.array(z.string()).default([]),
    press: z.array(z.object({ title: z.string(), source: z.string(), url: z.string().url() })).default([]),
  }),
});

export const collections = { advertising };
