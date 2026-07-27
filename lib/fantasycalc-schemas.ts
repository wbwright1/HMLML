import { z } from "zod";

// ─── Player ──────────────────────────────────────────────────────────────────

export const FantasyCalcPlayerSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    sleeperId: z.string().nullable(),
    position: z.string(),
  })
  .passthrough();

export type FantasyCalcPlayer = z.infer<typeof FantasyCalcPlayerSchema>;

// ─── Value ───────────────────────────────────────────────────────────────────

export const FantasyCalcValueSchema = z
  .object({
    player: FantasyCalcPlayerSchema,
    value: z.number(),
    overallRank: z.number(),
    positionRank: z.number().nullable().optional(),
    trend30Day: z.number().nullable().optional(),
    redraftValue: z.number().nullable().optional(),
    maybeTier: z.number().nullable().optional(),
  })
  .passthrough();

export type FantasyCalcValue = z.infer<typeof FantasyCalcValueSchema>;
