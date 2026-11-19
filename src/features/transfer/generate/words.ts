/**
 * The word lists of generated strings (`transfer.generate-values`): common English words, first and last names,
 * cities, countries, streets. Ported from Mongoster's `src/shared/generate.ts`.
 */

const list = (text: string): readonly string[] => text.split(' ');

/** Common words, for text and slugs when the examples have too few. */
export const commonWords = list(
  'time year people way day thing world life hand part child eye place work week case point number group problem fact ' +
    'home water room money story month book job word business issue side kind head house service friend power hour game ' +
    'line end member city name team minute idea body information level office door health art history party result ' +
    'change morning reason research moment air teacher force education music market sense plan interest experience ' +
    'effect class control care field development role rate heart show leader light voice mind price report decision ' +
    'view town road value building action model season society position player record paper space ground form event ' +
    'matter center site project activity star table need cost industry figure street image phone data picture practice ' +
    'piece land product wall worker news test movie support technology step computer type film tree source window song ' +
    'garden river summer winter coffee bread cloud stone paper glass silver orange yellow green blue simple quick bright ' +
    'quiet modern small large local social national early real best free whole special easy clear recent certain open ' +
    'single current private common natural similar ready central final main nice huge popular classic fresh smart rapid ' +
    'solid daily global urban',
);

/** First names of people of many countries. */
export const firstNames = list(
  'James Mary John Patricia Robert Jennifer Michael Linda William Elizabeth David Barbara Richard Susan Joseph Jessica ' +
    'Thomas Sarah Charles Karen Christopher Lisa Daniel Nancy Matthew Betty Anthony Sandra Mark Margaret Steven Emily ' +
    'Paul Laura Andrew Michelle Joshua Rachel Kevin Amanda Brian Melissa George Julia Luca Giulia Marco Francesca Sofia ' +
    'Matteo Emma Lucas Mia Noah Olivia Liam Ava Elena Hugo Chloe Yuki Hana Wei Mei Arjun Priya Omar Fatima Carlos Ana ' +
    'Lars Ingrid',
);

/** The first names, to tell names of people. */
export const firstNameSet: ReadonlySet<string> = new Set(firstNames);

/** Last names of people of many countries. */
export const lastNames = list(
  'Smith Johnson Williams Brown Jones Garcia Miller Davis Rodriguez Martinez Hernandez Lopez Gonzalez Wilson Anderson ' +
    'Thomas Taylor Moore Jackson Martin Lee Perez Thompson White Harris Sanchez Clark Ramirez Lewis Robinson Walker ' +
    'Young Allen King Wright Scott Torres Nguyen Hill Flores Green Adams Nelson Baker Hall Rivera Campbell Mitchell ' +
    'Carter Roberts Rossi Russo Ferrari Esposito Bianchi Romano Colombo Ricci Schmidt Schneider Dubois Laurent Tanaka ' +
    'Suzuki Kim Park Chen Wang Singh Patel Larsen Novak',
);

/** Large cities. */
export const cities: readonly string[] = [
  'New York',
  'London',
  'Paris',
  'Tokyo',
  'Berlin',
  'Madrid',
  'Rome',
  'Milan',
  'Toronto',
  'Sydney',
  'Chicago',
  'Los Angeles',
  'San Francisco',
  'Seattle',
  'Boston',
  'Amsterdam',
  'Barcelona',
  'Lisbon',
  'Vienna',
  'Prague',
  'Dublin',
  'Stockholm',
  'Oslo',
  'Copenhagen',
  'Zurich',
  'Munich',
  'Seoul',
  'Singapore',
  'Mumbai',
  'São Paulo',
  'Mexico City',
  'Buenos Aires',
  'Cape Town',
  'Istanbul',
  'Dubai',
  'Bangkok',
  'Melbourne',
  'Vancouver',
  'Turin',
  'Naples',
  'Florence',
];

/** Country names. */
export const countries: readonly string[] = [
  'United States',
  'United Kingdom',
  'France',
  'Germany',
  'Italy',
  'Spain',
  'Portugal',
  'Netherlands',
  'Belgium',
  'Switzerland',
  'Austria',
  'Sweden',
  'Norway',
  'Denmark',
  'Ireland',
  'Poland',
  'Canada',
  'Mexico',
  'Brazil',
  'Argentina',
  'Japan',
  'South Korea',
  'China',
  'India',
  'Australia',
  'New Zealand',
  'South Africa',
  'Egypt',
  'Turkey',
  'Singapore',
];

/** Two-letter country codes. */
export const countryCodes = list(
  'US GB FR DE IT ES PT NL BE CH AT SE NO DK IE PL CA MX BR AR JP KR CN IN AU NZ ZA EG TR SG',
);

/** Street names, without their type. */
export const streets = list(
  'Main Oak Pine Maple Cedar Elm Washington Lake Hill Park Church High Mill River Station Garden Victoria King Queen ' +
    'Market Bridge Spring Sunset Forest Meadow',
);

/** Street types: `Street`, `Avenue`… */
export const streetTypes = list('Street Avenue Road Lane Drive Boulevard Way Court');
