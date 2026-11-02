// Histórico do ajuste fino dos analógicos, por número de série, guardado no navegador.
// Serve para "Restaurar calibração": volta o controle para como ele estava numa conexão anterior.
"use strict";

export const FINE_NAMES = ["LL", "LT", "RL", "RT", "LR", "LB", "RR", "RB", "LX", "LY", "RX", "RY"];
const KEY = "ps5web.fineHistory";
const MAX = 10;

const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);

export function makeHistory(storage = globalThis.localStorage) {
  const readAll = () => { try { return JSON.parse(storage.getItem(KEY) || "{}") || {}; } catch { return {}; } };
  const writeAll = (o) => { try { storage.setItem(KEY, JSON.stringify(o)); } catch { /* sem espaço ou modo privado */ } };
  return {
    list(serial) { return serial ? (readAll()[serial] || []) : []; },
    // guarda uma cópia; se for igual à última, só atualiza a data
    save(serial, data, now = Date.now()) {
      if (!serial || !Array.isArray(data) || data.length !== 12) return null;
      const all = readAll(), list = all[serial] || [];
      if (list.length && same(list[0].data, data)) { list[0].ts = now; }
      else { list.unshift({ id: now.toString(36) + Math.random().toString(36).slice(2, 7), ts: now, data: data.slice() }); }
      all[serial] = list.slice(0, MAX); writeAll(all);
      return all[serial][0];
    },
    get(serial, id) { return this.list(serial).find((e) => e.id === id) || null; },
    remove(serial, id) {
      const all = readAll(); all[serial] = (all[serial] || []).filter((e) => e.id !== id); writeAll(all);
    },
  };
}
