import { SEARCH_COUNTRIES } from '../markets';

/** The `<option>` list for every Careers country picker, so the pickers can never drift apart. */
export function CountryOptions() {
  return (
    <>
      {SEARCH_COUNTRIES.map((c) => (
        <option key={c.value} value={c.value}>{c.label}</option>
      ))}
    </>
  );
}
