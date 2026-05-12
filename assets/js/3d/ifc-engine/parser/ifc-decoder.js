// IFC string encoding decoder.
// Supports \S\, \X\HH, \X2\...\X0\, \X4\...\X0\ formats per ISO 10303-21.
// Adapted from BIM_checker/assets/js/common/ifc-parser-core.js (decodeIFCString).

export function decodeIFCString(str) {
  if (!str) return str;

  // \S\X — ISO 8859-1 supplement: char code + 128
  str = str.replace(/\\S\\(.)/g, (_, c) => String.fromCharCode(c.charCodeAt(0) + 128));

  // \X\HH — ISO 8859-1 single byte
  str = str.replace(/\\X\\([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  // \X2\HHHH...HHHH\X0\ — UTF-16
  str = str.replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (_, hex) => {
    let out = '';
    for (let i = 0; i < hex.length; i += 4) {
      out += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
    }
    return out;
  });

  // \X4\HHHHHHHH...HHHHHHHH\X0\ — UTF-32
  str = str.replace(/\\X4\\([0-9A-F]+)\\X0\\/gi, (_, hex) => {
    let out = '';
    for (let i = 0; i < hex.length; i += 8) {
      out += String.fromCodePoint(parseInt(hex.substr(i, 8), 16));
    }
    return out;
  });

  return str;
}
