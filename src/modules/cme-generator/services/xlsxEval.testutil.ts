// Valutatore minimo di formule Excel, solo per verificare nei test le formule generate
// (aritmetica, SUM, SUBTOTAL(9,…), IF, SUMIFS, COUNTIF, riferimenti anche tra fogli).
export interface CellInfo { f?: string; v: number | string }
export type Getter = (sheet: string, addr: string) => CellInfo | undefined;

const colNum = (s: string) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colName = (n: number) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

export function createEvaluator(get: Getter, defaultSheet: string) {
  const memo = new Map<string, number | string>();

  const cellValue = (sheet: string, addr: string): number | string => {
    const key = `${sheet}!${addr}`;
    if (memo.has(key)) return memo.get(key)!;
    const c = get(sheet, addr);
    let v: number | string = 0;
    if (c) v = c.f ? evalFormula(c.f, sheet) : c.v;
    memo.set(key, v);
    return v;
  };

  const range = (sheet: string, a: string, b: string) => {
    const ma = /^([A-Z]+)(\d+)$/.exec(a)!, mb = /^([A-Z]+)(\d+)$/.exec(b)!;
    const out: { v: number | string; f?: string }[] = [];
    for (let r = Number(ma[2]); r <= Number(mb[2]); r++) {
      for (let c = colNum(ma[1]); c <= colNum(mb[1]); c++) {
        const addr = colName(c) + r;
        out.push({ v: cellValue(sheet, addr), f: get(sheet, addr)?.f });
      }
    }
    return out;
  };

  const matchCrit = (v: number | string, crit: string | number) => {
    if (typeof crit === 'number') return v === crit;
    const re = new RegExp('^' + crit.replace(/[.+^${}()|\\[\]]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
    return re.test(String(v));
  };

  const fns = {
    SUM: (...a: any[]) => a.flat().reduce((s: number, x: any) => s + (typeof x === 'object' ? Number(x.v) || 0 : Number(x) || 0), 0),
    SUBTOTAL: (_fn: number, ...rs: any[]) => rs.flat().reduce((s: number, x: any) => (x.f && /^SUBTOTAL/i.test(x.f) ? s : s + (Number(x.v) || 0)), 0),
    IF: (c: boolean, a: any, b: any) => (c ? a : b),
    COUNTIF: (r: any[], crit: string | number) => r.filter(x => matchCrit(x.v, crit)).length,
    SUMIFS: (sum: any[], ...pairs: any[]) => {
      let total = 0;
      sum.forEach((x, i) => {
        let ok = true;
        for (let p = 0; p < pairs.length; p += 2) if (!matchCrit(pairs[p][i].v, pairs[p + 1])) { ok = false; break; }
        if (ok) total += Number(x.v) || 0;
      });
      return total;
    },
    __range: range,
    __cell: (s: string, a: string) => cellValue(s, a),
  };

  function evalFormula(formula: string, sheet: string): number | string {
    const SHEETREF = "(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_]*))!";
    let js = formula;
    // intervalli (con foglio opzionale), poi celle singole
    js = js.replace(new RegExp(`(?:${SHEETREF})?\\$?([A-Z]+)\\$?(\\d+):\\$?([A-Z]+)\\$?(\\d+)`, 'g'),
      (_m, s1, s2, c1, r1, c2, r2) => `__range(${JSON.stringify(s1 ?? s2 ?? sheet)},"${c1}${r1}","${c2}${r2}")`);
    js = js.replace(new RegExp(`(?<![A-Za-z_"])(?:${SHEETREF})?\\$?([A-Z]{1,3})\\$?(\\d+)(?![\\d(])`, 'g'),
      (m, s1, s2, c, r) => (m.startsWith('__') ? m : `__cell(${JSON.stringify(s1 ?? s2 ?? sheet)},"${c}${r}")`));
    js = js.replace(/(?<![<>!=])=(?!=)/g, '==');
    // eslint-disable-next-line no-new-func
    return new Function(...Object.keys(fns), `return (${js});`)(...Object.values(fns));
  }

  return { cellValue, evalFormula };
}
