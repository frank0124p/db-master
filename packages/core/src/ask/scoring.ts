/**
 * Ask Pipeline — Scoring constants.
 *
 * All constants are exported so unit tests and linking.ts can import them
 * from a single canonical location.
 */

/** Base score for exact name match (after normalisation). */
export const SCORE_EXACT = 1.2;

/** Base score for prefix match. */
export const SCORE_PREFIX = 0.8;

/** Base score for n-gram contains match (×length-weight). */
export const SCORE_GRAM = 0.4;

/** Score boost when a definition/description contains the query token. */
export const SCORE_DEFINITION = 0.3;

/** Score boost when a sampleValue matches the query token. */
export const SCORE_VALUE = 1.5;

/** Score boost for each concept-hit propagation (maps_to_concept edge). */
export const SCORE_CONCEPT_HIT = 1.0;

/** Multiplier for governed-column (gwc) nodes — semantic layer priority. */
export const MULT_GWC = 1.3;

/** Multiplier for governed wide-table (gwt) nodes — semantic layer priority. */
export const MULT_GWT = 1.2;

/** Multiplier for deprecated nodes — Phase 10 downweighting. */
export const MULT_DEPRECATED = 0.3;
