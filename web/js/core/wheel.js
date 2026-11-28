// Levels, special slices and the weighted odds.
// The wheel is DRAWN with equal slices, but the result is picked by weight.
//
// Weights (total 1467.51):
//   levels  : 500 / 300 / 200 / 150 / 100 / 75 / 50 / 25
//   specials: 2x 15, 3x 10, Shield 37.5, Free 5, Easter egg 0.01
// Fixed order 2x > 3x > Free is intentional.
//
// Extreme mode (0.1.4) FLIPS the eight level weights: the hardest level gets the weight of the easiest one and so on
// (Impossible 500, Insanely Hard 300, ... Very Easy 25). Points, seconds and the specials (2x, 3x, Shield, Free 5,
// Easter egg) do not change, so the total and the Easter egg odds stay exactly the same.
//
// 0.1.5: Custom mode supports custom level colors via levelColors map.
// 0.1.6: Advanced Mode can set the chance of the 8 levels, 2x, 3x, Shield and Free 5 (percentages that add up to 100) and turn
// the Easter egg off. An optional multiplier scales the egg's probability. Extreme mode still flips the eight level chances.
var Wheel = (function () {
  // id, name, colour, text colour, points, seconds, weight
  var L = [
    ["very-easy","Very Easy","#8bd88b","#000",1,15,500],
    ["easy","Easy","#2e9e44","#fff",2,15,300],
    ["normal","Normal","#f2d024","#000",3,20,200],
    ["hard","Hard","#f28c1c","#000",4,20,150],
    ["very-hard","Very Hard","#e03131","#fff",5,25,100],
    ["extremely-hard","Extremely Hard","#8b1a1a","#fff",8,25,75],
    ["insanely-hard","Insanely Hard","#8e44c9","#fff",10,30,50],
    ["impossible","Impossible (Almost)","#000","#fff",15,30,25]
  ].map(function (a) {
    return { id:a[0], name:a[1], label:a[0]==="impossible"?"Impossible":a[1], color:a[2], ink:a[3], points:a[4], time:a[5], weight:a[6] };
  });
  var S = [["x2","2x",15],["x3","3x",10],["shield","Shield",37.5],["free","Free 5",5],["egg","?",0.01]].map(function (a) {
    return { id:a[0], name:a[1]==="?"?"Easter Egg":a[1], label:a[1], color:"#5b6170", ink:"#fff", weight:a[2] };
  });
  var slices = L.concat(S);
  var total = slices.reduce(function (t, s) { return t + s.weight; }, 0);
  var egg = S[S.length - 1];
  var isLevel = function (id) { return L.some(function (lv) { return lv.id === id; }); };

  function eggChance(adv) {
    if (adv && adv.egg === false) return 0;
    var multiplier = adv && adv.eggMultiplier;
    if (!Number.isInteger(multiplier) || multiplier < 1 || multiplier > 1000) multiplier = 1;
    return egg.weight * multiplier / total;
  }

  function eggWeight(adv, normalized) {
    var chance = eggChance(adv), ordinaryWeight = normalized ? 100 : total - egg.weight;
    // Give the egg its target share while preserving the relative odds of all the other slices.
    return ordinaryWeight * chance / (1 - chance);
  }

  function weight(s, extreme, adv) {
    if (s.id === "egg") return eggWeight(adv, !!(adv && adv.weights));
    var i = L.findIndex(function (lv) { return lv.id === s.id; });
    if (!adv || !adv.weights) return extreme && i >= 0 ? L[L.length - 1 - i].weight : s.weight; // only the eight levels flip
    var id = extreme && i >= 0 ? L[L.length - 1 - i].id : s.id; // Extreme still flips the levels, the specials never change
    var w = adv.weights[id];
    return typeof w === "number" && isFinite(w) && w > 0 ? w : 0;
  }
  function pick(extreme, adv) {
    var sum = slices.reduce(function (t, s) { return t + weight(s, extreme, adv); }, 0);
    if (!(sum > 0)) return slices[0];
    var r = Math.random() * sum;
    for (var i = 0; i < slices.length; i++) { r -= weight(slices[i], extreme, adv); if (r < 0) return slices[i]; }
    for (var j = slices.length - 1; j >= 0; j--) if (weight(slices[j], extreme, adv) > 0) return slices[j]; // rounding at the very end
    return slices[0];
  }
  function percent(s, extreme, adv) {
    var sum = slices.reduce(function (t, x) { return t + weight(x, extreme, adv); }, 0);
    return sum > 0 ? weight(s, extreme, adv) / sum * 100 : 0;
  }

  function eggOdds(adv) {
    var chance = eggChance(adv);
    return chance ? Math.round(1 / chance) : null;
  }

  // The slices to DRAW, with custom level colors applied (looks only: odds, points and seconds never change).
  // levelColors is { levelId: "#rrggbb" }; anything that is not a valid color is ignored.
  function getSlices(levelColors) {
    if (!levelColors) return slices;
    return slices.map(function (s) {
      var c = levelColors[s.id];
      if (typeof c !== "string" || !/^#[0-9a-fA-F]{6}$/.test(c) || !isLevel(s.id)) return s;
      return { id:s.id, name:s.name, label:s.label, color:c, ink:ink(c), points:s.points, time:s.time, weight:s.weight };
    });
  }

  // Black or white text, whichever has more contrast on this color.
  function ink(hex) {
    var n = parseInt(hex.slice(1), 16);
    var v = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (x) { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); });
    var lum = .2126 * v[0] + .7152 * v[1] + .0722 * v[2];
    return lum > .179 ? "#000" : "#fff";
  }

  return { slices: slices, total: total, pick: pick, percent: percent, weight: weight, getSlices: getSlices,
    eggChance: eggChance, eggOdds: eggOdds, EGG_WEIGHT: eggWeight(null, true) };
})();
