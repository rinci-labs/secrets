import { defineCollection } from "astro:content"
import { glob } from "astro/loaders"
import { z } from "astro/zod"
import { docGroups } from "./site"

const docs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/docs" }),
  schema: z.object({
    title: z.string(),
    /** Shown in search results and the page header. Keep it under about 155 characters. */
    description: z.string().max(170),
    group: z.enum(docGroups),
    order: z.number(),
    /** Sidebar label when the title is too long for it. */
    label: z.string().optional(),
  }),
})

export const collections = { docs }
