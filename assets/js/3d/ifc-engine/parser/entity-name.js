// Shared helpers for extracting Name + GlobalId from raw IFC entity params.
//
// IFC4 IfcRoot subtypes (IfcWall, IfcSlab, etc.) have attribute order:
//   GlobalId(0), OwnerHistory(1), Name(2), Description(3), ObjectType(4), ...
//
// extractEntityName/Guid take the raw STEP params string (post-tokenization
// from step-parser) and pull out the relevant single-quoted string, decoding
// IFC encoding (\X\, \X2\, etc.) along the way.

import { decodeIFCString } from './ifc-decoder.js';
import { splitParams } from './step-parser.js';

/**
 * Extract Name attribute (index 2) from raw IFC entity params.
 * Returns decoded string or null.
 *
 * @param {string} rawParams — entity.params from EntityIndex
 * @returns {string | null}
 */
export function extractEntityName(rawParams) {
  if (!rawParams) return null;
  const parts = splitParams(rawParams);
  if (parts.length < 3) return null;
  const token = parts[2]; // Name is at index 2 in IfcRoot subtypes
  if (!token || token === '$') return null;
  // Unquote: token should be 'value'
  if (token.startsWith("'") && token.endsWith("'")) {
    const raw = token.slice(1, -1);
    return raw ? decodeIFCString(raw) : null;
  }
  return null;
}

/**
 * Extract GlobalId attribute (index 0) from raw IFC entity params.
 * Returns the first single-quoted string (no decoding — GUID is base64, not encoded text).
 *
 * @param {string} rawParams — entity.params from EntityIndex
 * @returns {string | null}
 */
export function extractEntityGuid(rawParams) {
  if (!rawParams) return null;
  const m = rawParams.match(/'([^']+)'/);
  return m ? m[1] : null;
}
