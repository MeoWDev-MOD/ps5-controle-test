// PIX estático para doações (formato BR Code do Banco Central, sem valor fixo).
"use strict";

export const PIX_KEY = "+5521966547296";
export const PIX_NAME = "JEFFERSON HONORIO";
export const PIX_CITY = "RIO DE JANEIRO";

// CRC16-CCITT-FALSE (exigido pelo BR Code)
export function crc16(s) {
  let c = 0xffff;
  for (let i = 0; i < s.length; i++) {
    c ^= s.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
  }
  return c.toString(16).toUpperCase().padStart(4, "0");
}
const tlv = (id, v) => id + String(v.length).padStart(2, "0") + v;

export function pixPayload(key = PIX_KEY, name = PIX_NAME, city = PIX_CITY) {
  const account = tlv("00", "br.gov.bcb.pix") + tlv("01", key);
  const body = tlv("00", "01") + tlv("26", account) + tlv("52", "0000") + tlv("53", "986") + tlv("58", "BR") +
    tlv("59", name.slice(0, 25)) + tlv("60", city.slice(0, 15)) + tlv("62", tlv("05", "***")) + "6304";
  return body + crc16(body);
}
