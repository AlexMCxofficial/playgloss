// Tests for web/js/online/link.js. Run: node tests/test_link.js
var assert = require("assert"), Link = require("../web/js/online/link.js");
var K = "A".repeat(43);
var good = Link.parse("http://192.168.1.23:49152/join.html#" + K);
assert(good && good.host === "192.168.1.23:49152" && good.key === K);
assert.strictEqual(Link.parse("  192.168.1.23:49152/join.html#" + K + " \n").host, "192.168.1.23:49152");
assert(Link.parse("HTTP://10.0.0.5:50000/JOIN.HTML#" + K));
assert(Link.parse("http://172.16.0.2:40000/join.html#" + K) && Link.parse("http://172.31.255.2:40000/join.html#" + K));
assert(Link.parse("http://169.254.3.4:40000/join.html#" + K));
// refused: not private, bad ports, wrong shape, secrets of the wrong size, tricks
["http://8.8.8.8:49152/join.html#", "http://172.32.0.1:49152/join.html#", "http://127.0.0.1:49152/join.html#",
 "http://192.168.1.2:80/join.html#", "http://192.168.1.2:70000/join.html#", "http://192.168.001.2:49152/join.html#",
 "http://192.168.1.256:49152/join.html#", "https://192.168.1.2:49152/join.html#", "http://example.com:49152/join.html#",
 "http://192.168.1.2:49152@evil.com/join.html#", "http://192.168.1.2:49152/other.html#", "javascript:alert(1)//#"
].forEach(function (p) { assert.strictEqual(Link.parse(p + K), null, p); });
assert.strictEqual(Link.parse("http://192.168.1.2:49152/join.html#" + "A".repeat(42)), null);
assert.strictEqual(Link.parse("http://192.168.1.2:49152/join.html#" + "A".repeat(44)), null);
assert.strictEqual(Link.parse("http://192.168.1.2:49152/join.html"), null);
assert.strictEqual(Link.parse(null), null);
assert.strictEqual(Link.appUrl(good), "join.html?h=192.168.1.23%3A49152#" + K);
assert(Link.hostOk("192.168.1.23:49152") && !Link.hostOk("8.8.8.8:49152") && !Link.hostOk(""));
console.log("link tests: ok");
