/**
 * The name a screen reader says for a control of the bar whose card gives it a name other than its text: the card's
 * name, followed by the text shown, so that whoever speaks the text shown to a voice control reaches it (WCAG 2.5.3,
 * *Label in Name*): **Find** is *Run query, Find*.
 */

/** The name of a control: its card's name, with the text it shows when the name does not hold it already. */
export function spokenName(name: string, shown: string): string {
  return name.toLowerCase().includes(shown.toLowerCase()) ? name : `${name}, ${shown}`;
}
