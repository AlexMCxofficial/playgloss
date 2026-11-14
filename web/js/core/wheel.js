// Levels, special slices and the weighted odds.
// The wheel is DRAWN with equal slices, but the result is picked by weight.
//
// Weights (total 1467.51):
//   levels  : 500 / 300 / 200 / 150 / 100 / 75 / 50 / 25
//   specials: 2x 15, 3x 10, Shield 37.5, Free 5, Easter egg 0.01
// Fixed order 2x > 3x > Free is intentional.
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
  function pick() {
    var r = Math.random() * total;
    for (var i = 0; i < slices.length; i++) { r -= slices[i].weight; if (r < 0) return slices[i]; }
    return slices[0];
  }
  function percent(s) { return s.weight / total * 100; }
  return { slices: slices, total: total, pick: pick, percent: percent };
})();
