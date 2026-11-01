type Goal = { title: string; assignee_user_id: number | null };

// Words that say how or when rather than what, so "Cut the drinking", "Drink
// less" and "Limit drinking to 2 days a week" all come down to drinking.
const FILLER = new Set(
    `a about all an and around at back be by could cut day do down for from get go in increase
    into keep less limit made make minimal more no not of on one or other our quit ramp reduce start stop
    the to try up use who with work finish focus plan here my your their week month quarter year
    daily weekly monthly january february march april may june july august september october
    november december`.split(/\s+/),
);

const words = (title: string) => title.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** Rough word stem, enough for "cards" and "card" or "insulated" and "insulate" to meet. */
const stem = (word: string) =>
    word
        .replace(/(?<!s)s$/, '')
        .replace(/(ing|ed)$/, '')
        .replace(/e$/, '');

const meaningfulWords = (title: string) =>
    new Set(
        words(title)
            .filter((word) => !FILLER.has(word) && !FILLER.has(stem(word)) && !/^\d/.test(word))
            .map(stem),
    );

// Each person's goals are their own, even under the same name.
const sameOwner = (a: Goal, b: Goal) =>
    a.assignee_user_id === null ||
    b.assignee_user_id === null ||
    a.assignee_user_id === b.assignee_user_id;

/**
 * The same title, ignoring case and punctuation: the server won't store these
 * twice. The twin of Item::sameGoalIn().
 */
export const isSameGoal = (a: Goal, b: Goal) =>
    sameOwner(a, b) && words(a.title).join(' ') === words(b.title).join(' ');

/**
 * Probably the same goal in other words: everything one title is about is also
 * in the other. One word in common with a much longer title is too little to go
 * on: "Run a 10k" isn't "Long run every Sunday". It's a guess, so it only ever
 * prompts, and it's for a person to decide.
 */
export function looksLikeSameGoal(a: Goal, b: Goal): boolean {
    const [first, second] = [meaningfulWords(a.title), meaningfulWords(b.title)];
    const [fewer, more] = first.size <= second.size ? [first, second] : [second, first];

    return (
        sameOwner(a, b) &&
        fewer.size > 0 &&
        (fewer.size > 1 || more.size <= 2) &&
        [...fewer].every((word) => more.has(word))
    );
}

/** Goals that look like the same one, in groups of two or more. */
export function lookAlikeGroups<T extends Goal>(goals: T[]): T[][] {
    const groups: T[][] = [];
    const grouped = new Set<T>();

    goals.forEach((goal, index) => {
        if (!grouped.has(goal)) {
            const group = [
                goal,
                ...goals
                    .slice(index + 1)
                    .filter((other) => !grouped.has(other) && looksLikeSameGoal(goal, other)),
            ];

            if (group.length > 1) {
                group.forEach((member) => grouped.add(member));
                groups.push(group);
            }
        }
    });

    return groups;
}
