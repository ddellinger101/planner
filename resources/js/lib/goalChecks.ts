import { looksLikeSameGoal } from './sameGoal';

/** A goal carried this many times is asked about rather than carried along again. */
export const CARRY_LIMIT = 2;

// Words for a direction rather than a finish line.
const VAGUE =
    /\b(better|continue|cut|focus|improve|increase|keep|less|maintain|minimal|more|ramp|reduce|regular|regularly|try|work on)\b/i;

// A number, an amount or a date says what finished looks like.
const SPECIFIC =
    /[\d$]|\bby (the )?(end|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|mon|tue|wed|thu|fri|sat|sun)/i;

/** A goal that says which way to go, but not how anyone would know it's done. */
export const isVague = (title: string) => VAGUE.test(title) && !SPECIFIC.test(title);

type Owned = { title: string; user_id: number };

/** The habit that already covers a goal, if one looks like it does. */
export const habitFor = <T extends Owned>(
    goal: { title: string; assignee_user_id: number | null },
    habits: T[],
) =>
    habits.find((habit) =>
        looksLikeSameGoal(goal, { title: habit.title, assignee_user_id: habit.user_id }),
    );

/** A goal's title as a habit: "Gym 3x a week" is "Gym", three times a week. */
export function habitFromGoal(title: string): { title: string; target: number } {
    const match = title.match(/\s*\b([1-7])\s*(?:x|times)(?:\s*(?:a|per)\s*week)?\s*$/i);

    return match
        ? { title: title.slice(0, match.index), target: Number(match[1]) }
        : { title, target: 7 };
}
