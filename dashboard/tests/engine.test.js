/*
 * Tests for the research engine (src/js/03_engine.js) in plain Node, no packages.
 *
 *   node dashboard/tests/engine.test.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const DATA = path.join(__dirname, '..', 'src', 'data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const src = 'function sgn(n,d){return (n>=0?"+":"-")+Math.abs(n).toFixed(d==null?1:d)}\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '03_engine.js'), 'utf8');
function mkRnd(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
const E = new Function('mkRnd', 'bars', 'sme', src + `
initBars(bars);
return {TEMPLATES:TEMPLATES, research:research, rankOf:rankOf, importedBacktest:importedBacktest};`)(mkRnd, read('bars.json'), read('sme_rows.json'));

let failed = 0;
function test(name, fn) { try { fn(); console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ' :: ' + e.message); } }

test('three templates are defined', () => assert.deepStrictEqual(Object.keys(E.TEMPLATES).sort(), ['donchian', 'ema_cross', 'rsi_reversion']));

const bounds = (id) => { const T = E.TEMPLATES[id], b = {}; Object.keys(T.params).forEach((k) => { b[k] = { min: T.params[k].min, max: T.params[k].max, step: T.params[k].step }; }); return b; };
const runs = {};
['donchian', 'ema_cross', 'rsi_reversion'].forEach((id) => { runs[id] = E.research(id, bounds(id), 0); });

test('research is deterministic', () => {
  const again = E.research('donchian', bounds('donchian'), 0);
  assert.strictEqual(JSON.stringify(again.backtest.params), JSON.stringify(runs.donchian.backtest.params));
  assert.strictEqual(again.trades.length, runs.donchian.trades.length);
});
test('trials are counted (more trials, higher bar)', () => assert.ok(runs.donchian.backtest.trials > 1));

const sme = E.importedBacktest(read('sme_rows.json'), { trials: 64, dataset: 'test', cost: 'test' });
test('SME import reproduces the 437 trade list', () => assert.strictEqual(sme.metrics.full.n, 437));
test('SME import total is about +117 R', () => assert.ok(Math.abs(sme.metrics.full.totR - 117.1) < 1, String(sme.metrics.full.totR)));

const mk = (id, bt, verified) => ({ id, name: id, kind: 'template', backtest: bt, forward: null, trials: bt.trials, gates: [0, 1, 2, 3, 4, 5].map((i) => ({ i, status: 'pending', criteria: [] })) });
test('scores stay within 0 to 100', () => ['donchian', 'ema_cross', 'rsi_reversion'].forEach((id) => {
  const r = E.rankOf(mk(id, runs[id].backtest)); assert.ok(r.score >= 0 && r.score <= 100, id + ' ' + r.score);
}));
test('a strategy under 150 trades is never eligible', () => {
  const r = E.rankOf(mk('rsi_reversion', runs.rsi_reversion.backtest));
  if (runs.rsi_reversion.backtest.metrics.full.n < 150) assert.strictEqual(r.eligible, false);
});

console.log(failed ? '\n' + failed + ' failed' : '\nall passed');
process.exit(failed ? 1 : 0);
