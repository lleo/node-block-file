
"use strict";

var assert = require('assert')
  , format = require('util').format


exports.cmp = cmp
function cmp(a, b) {
  //assert.ok(typeof a == 'string')
  //assert.ok(typeof b == 'string')

  if (a > b) return 1
  if (b > a) return -1
  return 0
}

/**
 * Multiply a string N times.
 *   Stolen form https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String
 * @param {String} str
 * @param {Number} n
 * @return {String}
 */
exports.mult = mult
exports.repeat = mult //for compatability
function mult(str, n) {
  var sd = ""
    , s2 = n > 0 ? str : ""
    , mask
  for (mask = n; mask > 1; mask >>= 1) {
    if (mask & 1) sd += s2
    s2 += s2
  }
  return s2 + sd
}

/**
 * Increment a string ala perl's ++ operator on a string
 *
 * @param {String} str
 * @return {String}
 */
exports.inc = inc
function inc(str){
  if (str.length == 0) return "a"

  var last = str[str.length-1]
    , rest = str.substr(0, str.length-1)

  if (last == "z") {
    if (rest.length == 0) return "aa"
    else return inc(rest) + "a"
  }
  if (last == "Z") {
    if (rest.length == 0) return "AA"
    else return inc(rest) + "A"
  }
  if (last == "9") {
    if (rest.length == 0) return "10"
    else return inc(rest) + "0"
  }

  return rest + String.fromCharCode( last.charCodeAt(0)+1 )
}

/**
* Formats the number according to the ‘format’ string;
* adherses to the american number standard where a comma
* is inserted after every 3 digits.
*  note: there should be only 1 contiguous number in the format,
* where a number consists of digits, period, and commas
*        any other characters can be wrapped around this number, including ‘$’, ‘%’, or text
*        examples (123456.789):
*          ‘0′ - (123456) show only digits, no precision
*          ‘0.00′ - (123456.78) show only digits, 2 precision
*          ‘0.0000′ - (123456.7890) show only digits, 4 precision
*          ‘0,000′ - (123,456) show comma and digits, no precision
*          ‘0,000.00′ - (123,456.78) show comma and digits, 2 precision
*          ‘0,0.00′ - (123,456.78) shortcut method, show comma and digits, 2 precision
*
* @method format
* @param {String} format the way you would like to format this text
* @return {String} the formatted number
* @public
*/

Number.prototype.format = function(format) {
  if (typeof format != 'string') { return "" } // sanity check

  var hasComma = -1 < format.indexOf(',')
    , psplit = format.split('.')
    , that = this

  // compute precision
  if (1 < psplit.length) {
    // fix number precision
    that = that.toFixed(psplit[1].length)
  }
  // error: too many periods
  else if (2 < psplit.length) {
    throw("NumberFormatException: invalid format, formats should have no more than 1 period: " + format)
  }
  // remove precision
  else {
    that = that.toFixed(0)
  }

  // get the string now that precision is correct
  var fnum = that.toString()

  // format has comma, then compute commas
  if (hasComma) {
    // remove precision for computation
    psplit = fnum.split('.')

    var cnum = psplit[0]
      , parr = []
      , j = cnum.length
      , m = Math.floor(j / 3)
      , n = cnum.length % 3 || 3 // n cannot be ZERO or causes infinite loop

    // break the number into chunks of 3 digits; first chunk may be less than 3
    for (var i = 0; i < j; i += n) {
      if (i != 0) { n = 3 }
      parr[parr.length] = cnum.substr(i, n)
      m -= 1
    }

    // put chunks back together, separated by comma
    fnum = parr.join(',')

    // add the precision back in
    if (psplit[1]) { fnum += '.' + psplit[1] }
  }

  // replace the number portion of the format with fnum
  return format.replace(/[\d,?\.?]+/, fnum)
}
