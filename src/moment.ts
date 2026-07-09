/* Obsidian's typings expose `moment` as a namespace, which TypeScript refuses
 * to call even though the runtime value is the callable moment factory. This
 * shim re-types it with just the surface this plugin uses. */
import { moment as obsidianMoment } from "obsidian";

export interface MomentLike {
	format(fmt?: string): string;
	add(amount: number, unit: string): MomentLike;
	isValid(): boolean;
}

type MomentFactory = (
	input?: string | MomentLike,
	format?: string,
	strict?: boolean
) => MomentLike;

export const moment = obsidianMoment as unknown as MomentFactory;
