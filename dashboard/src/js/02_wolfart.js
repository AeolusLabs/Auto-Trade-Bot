/* 02_wolfart.js: The wolf portraits: one hand-built low-poly head, mirrored, drawn from a per-wolf palette. Four presets plus a generator for any hue. */
/* ---------- hand-built wolf portraits ---------- */
function wolf(o){
  var L='<polygon points="12,1 3,34 30,28" fill="'+o.d+'"/><polygon points="13,9 9,30 24,27" fill="'+o.ear+'"/>'+
  '<polygon points="30,28 50,21 50,44 36,38" fill="'+o.m+'"/><polygon points="30,28 36,38 20,46 3,34" fill="'+o.d+'"/>'+
  '<polygon points="3,34 20,46 12,58 0,50" fill="'+o.m+'"/><polygon points="0,50 12,58 17,72 6,68" fill="'+o.d+'"/><polygon points="12,58 18,60 17,72" fill="'+o.m+'"/>'+
  '<polygon points="20,46 36,38 38,50 26,56" fill="'+o.mask+'"/><polygon points="26,56 38,50 36,66 18,60" fill="'+o.m+'"/>'+
  '<polygon points="36,38 50,44 50,78 40,76 38,50" fill="'+o.l+'"/><polygon points="18,60 36,66 40,76 50,80 50,97 28,86 17,72" fill="'+o.ll+'"/>'+
  '<polygon points="24,45 35,40 38,46 28,49" fill="'+o.eye+'"/><polygon points="31,43 35,42 36,46 32,47" fill="'+o.pupil+'"/>'+o.mark;
  return '<svg viewBox="0 0 100 100" aria-hidden="true"><g transform="translate(8,9) scale(.84)"><g>'+L+'</g><g transform="translate(100,0) scale(-1,1)">'+L+'</g>'+
  '<polygon points="44,75 56,75 50,83" fill="'+o.nose+'"/><path d="M50 83v4M50 87q-6 4-13 0M50 87q6 4 13 0" stroke="'+o.nose+'" stroke-width="1.6" fill="none" stroke-linecap="round"/></g></svg>';
}
var ART={
 ridge:wolf({d:"oklch(36% 0.03 60)",m:"oklch(50% 0.04 65)",l:"oklch(68% 0.05 75)",ll:"oklch(82% 0.04 85)",ear:"oklch(62% 0.1 55)",mask:"oklch(27% 0.03 60)",eye:"oklch(80% 0.15 85)",pupil:"oklch(15% 0.02 60)",nose:"oklch(18% 0.02 60)",mark:'<polygon points="46,22 50,21 50,36 47,34" fill="oklch(28% 0.03 60)"/>'}),
 scout:wolf({d:"oklch(60% 0.03 230)",m:"oklch(76% 0.025 230)",l:"oklch(90% 0.015 230)",ll:"oklch(96% 0.01 230)",ear:"oklch(70% 0.06 215)",mask:"oklch(48% 0.04 230)",eye:"oklch(82% 0.12 205)",pupil:"oklch(18% 0.03 230)",nose:"oklch(25% 0.03 230)",mark:'<polygon points="47,22 50,21 50,40 48,38" fill="oklch(97% 0.01 230)"/>'}),
 dusk:wolf({d:"oklch(22% 0.04 300)",m:"oklch(32% 0.06 305)",l:"oklch(42% 0.08 308)",ll:"oklch(52% 0.09 310)",ear:"oklch(45% 0.14 320)",mask:"oklch(15% 0.03 300)",eye:"oklch(85% 0.13 330)",pupil:"oklch(12% 0.02 300)",nose:"oklch(12% 0.02 300)",mark:'<polygon points="22,40 38,43 37,45 21,42" fill="oklch(78% 0.04 305)"/>'}),
 ember:wolf({d:"oklch(30% 0.06 25)",m:"oklch(44% 0.1 28)",l:"oklch(60% 0.1 38)",ll:"oklch(80% 0.06 55)",ear:"oklch(52% 0.16 15)",mask:"oklch(21% 0.05 22)",eye:"oklch(88% 0.13 100)",pupil:"oklch(14% 0.03 22)",nose:"oklch(15% 0.03 22)",mark:'<polygon points="44,23 50,21 50,30 46,31" fill="oklch(22% 0.05 22)"/><polygon points="45,32 50,31 50,38 47,37" fill="oklch(22% 0.05 22)"/>'}),
 sentinel:wolf({d:"oklch(30% 0.02 268)",m:"oklch(45% 0.025 268)",l:"oklch(62% 0.025 268)",ll:"oklch(78% 0.02 268)",ear:"oklch(55% 0.03 268)",mask:"oklch(20% 0.02 268)",eye:"oklch(86% 0.1 195)",pupil:"oklch(14% 0.02 268)",nose:"oklch(16% 0.02 268)",mark:'<polygon points="44,24 56,24 50,32" fill="oklch(86% 0.1 195)"/>'})
};
