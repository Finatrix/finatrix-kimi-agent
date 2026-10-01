/* Small runtime gap between Android WebView 91 and the app's dependencies.
 * This classic script runs before the module entry, so startup imports can use
 * these methods. Keep it ES2017-compatible and avoid bundling a polyfill suite.
 */
(function () {
  if (!Array.prototype.at) {
    Object.defineProperty(Array.prototype, 'at', {
      configurable: true,
      writable: true,
      value: function (index) {
        if (this == null) throw new TypeError('Array.prototype.at called on null or undefined');
        var value = Object(this);
        var length = value.length >>> 0;
        var n = Number(index);
        if (n !== n) n = 0;
        if (n !== Infinity && n !== -Infinity) n = Math.trunc(n);
        var position = n < 0 ? length + n : n;
        return position < 0 || position >= length ? undefined : value[position];
      }
    });
  }
  if (!Object.hasOwn) {
    Object.defineProperty(Object, 'hasOwn', {
      configurable: true,
      writable: true,
      value: function (object, key) {
        return Object.prototype.hasOwnProperty.call(Object(object), key);
      }
    });
  }
}());
