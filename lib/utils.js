
"use strict";

var assert = require('assert')
  , crc16 = require('crc').buffer.crc16
  , crc32 = require('crc').buffer.crc32
  , fprintf = require('printf')


var printf = exports.printf = function(){
  var args = Array.prototype.slice.call(arguments)
  args.unshift(process.stdout)
  fprintf.apply(this, args)
}


var eprintf = exports.eprintf = function(){
  var args = Array.prototype.slice.call(arguments)
  args.unshift(process.stderr)
  fprintf.apply(this, args)
}

exports.err = function(){
  var args = Array.prototype.slice.call(arguments)
  console.error.apply(console, args)
}

var isInt = exports.isInt = function isInt(x) {
   return typeof x == 'number' && x % 1 == 0
}

var xor = exports.xor = function xor(p,q) { return (p && !q) || (!p && q) }

var log2 = exports.log2 = function log2(v) {
  var r = Math.log(v)/Math.LN2
    , rmod1 = r%1
  if (rmod1 > 0 && rmod1 <= 1.1368683772161603e-13) return Math.floor(r)
  if (rmod1 < 0 && -rmod1 <= 2.2737367544323206e-13) return Math.ceil(r)
  return r
}

var log10 = exports.log10 = function log10(v) {
  var r = Math.log(v)/Math.LN10
    , rmod1 = r%1
  if (rmod1 > 0 && 1-rmod1 <= 5.684341886080802e-14) return Math.ceil(r)
  if (rmod1 < 0 && 1+rmod1 <= 5.684341886080802e-14) return Math.floor(r)
  //works to -310  but it is probably matching to much non integer solutions
  return r
}

var min = exports.min = function min(){
  var minval = arguments[0]

  for (var i=1; i<arguments.length; i++)
    if (minval > arguments[i]) minval = arguments[i]

  return minval
}

var max = exports.max = function max(){
  var maxval = arguments[0]

  for (var i=1; i<arguments.length; i++)
    if (maxval < arguments[i]) maxval = arguments[i]

  return maxval
}

 var spanLength = exports.spanLength = function spanLength(spanNum) {
  return Math.pow(2, spanNum)
}


/**
 * Repeat a string N times.
 *   Stolen form https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String
 * @param {String} str
 * @param {Number} n
 * @return {String}
 */
var repeatStr = exports.repeatStr = function(str, n) {
  var sd = ""
    , s2 = n > 0 ? str : ""
    , mask
  for (mask = n; mask > 1; mask >>= 1) {
    if (mask & 1) sd += s2
    s2 += s2
  }
  return s2 + sd
}


/** Read the value (0|1) of a bit read from a buffer
 * @param {Buffer} buffer
 * @param {Number} bit
 * @return {Number} 0 or 1
 */
var readBit = exports.readBit = function readBit(buffer, bit) {
  var byt, off, num, res

  byt = Math.floor(bit/8)
  off = bit % 8
  num = buffer.readUInt8(byt)

  res = num & 1<<off

  return res > 0
//  return res ? 1 : 0
  //return (buffer.readUInt8(Math.floor(bit/8)) & 1<<(bit % 8)) !== 0
} //end: readBit


/** Write a boolean value to a given bit(offset=0) in a buffer
 * @param {Buffer} buffer
 * @param {Number} bit index of bit from beginning of buffer
 * @param {Boolean} value true/false value of bit to be set true=1 false=0
 * @return {undefined}
 */
var writeBit = exports.writeBit = function writeBit(buffer, bit, value) {
  var byt, off, num

  byt = Math.floor(bit/8)
  off = bit % 8
  num = buffer.readUInt8(byt)

  if (value) // set bit to 1
    num |= 1<<off
  else       // set bit to 0
    num &= ~(1<<off)

  buffer.writeUInt8(num, byt)

  return
}


/**
 * Calculate the CRC16 of a buffer. It must copy the buffer to a new temporary
 * buffer inorder to zero out the CRC16 value. This makes it more expensive.
 *
 * @param {Buffer} buffer
 * @param {Number} [offset=0] byte offset into buffer
 * @return {Number} the CRC16
 */
exports.calculateCRC16 = calculateCRC16
function calculateCRC16(buffer, offset) {
  //if (!offset) offset = 0
  if (typeof offset != 'number') offset = 0
  var buf = new Buffer(buffer.length)
  buffer.copy(buf)

  buf[offset  ] = 0
  buf[offset+1] = 0

  return crc16(buf)
}


/**
 * Read the CRC16 value from a buffer
 *
 * @param {Buffer} buffer
 * @param {Number} [offset=0] byte offset into buffer
 * @return {Number} the CRC16
 */
exports.readCRC16 = readCRC16
function readCRC16(buffer, offset) {
  //if (!offset) offset = 0
  if (typeof offset != 'number') offset = 0
  return buffer.readUInt16BE(offset)
}


/** This signs the CRC16 of the buffer
 * @param {Buffer} buffer
 * @param {Number} [offset=0] byte offset into buffer
 * @return {Buffer}
 */
exports.signCRC16 = signCRC16
function signCRC16(buffer, offset) {
  //if (!offset) offset=0
  if (typeof offset != 'number') offset=0
  buffer[offset  ] = 0
  buffer[offset+1] = 0
  buffer.writeUInt16BE(crc16(buffer), offset)
  return buffer
}


/**
 * Validate the CRC16 of a buffer.
 *
 * @param {Buffer} buffer
 * @param {Number} [offset=0] byte offset into buffer
 * @return {Boolean} true for matching CRC, false for no-match
 */
exports.validateCRC16 = validateCRC16
function validateCRC16(buffer, offset) {
  return readCRC16(buffer, offset) === calculateCRC16(buffer, offset)
}


/**
 * Calculate the CRC32 of a buffer. It must copy the buffer to a new temporary
 * buffer inorder to zero out the CRC32 value. This makes it more expensive.
 *
 * @param {Buffer} buffer
 * @param {Number} [offset=0] byte offset into buffer
 * @return {Number} the CRC32
 */
exports.calculateCRC32 = calculateCRC32
function calculateCRC32(buffer, offset) {
  //if (!offset) offset = 0
  if (typeof offset != 'number') offset = 0
  var buf = new Buffer(buffer.length)
  buffer.copy(buf)

  buf[offset  ] = 0
  buf[offset+1] = 0
  buf[offset+2] = 0
  buf[offset+3] = 0

  var chkSum = crc32(buf)>>>0 //crc32() returns a negative number according to
                              // some crazy EcmaScript Specification (not V8) ?!?
  //console.error("calculateCRC32: chkSum = %d", chkSum)
  return chkSum
}


/**
 * Read the CRC32 value from a buffer
 *
 * @param {Buffer} buffer
 * @param {Number} [offset=0] byte offset into buffer
 * @return {Number} the CRC32
 */
exports.readCRC32 = readCRC32
function readCRC32(buffer, offset) {
  //if (!offset) offset = 0
  if (typeof offset != 'number') offset = 0
  var chkSum = buffer.readUInt32BE(offset)
  //console.error("readCRC32: chkSum = %d", chkSum)
  return chkSum
}


/** This signs the CRC32 of the buffer
 * @param {Buffer} buffer
 * @param {Number} [offset=0] byte offset into buffer
 * @return {Buffer}
 */
exports.signCRC32 = signCRC32
function signCRC32(buffer, offset) {
  //if (!offset) offset=0
  if (typeof offset != 'number') offset=0

  buffer[offset  ] = 0
  buffer[offset+1] = 0
  buffer[offset+2] = 0
  buffer[offset+3] = 0

  var chkSum = crc32(buffer)>>>0
  buffer.writeUInt32BE(chkSum, offset)
  //buffer.writeUInt32BE(crc32(buffer)>>>0, offset)

  //console.error("sign CRC32: chkSum = %d", chkSum)

  return chkSum
}


/**
 * Validate the CRC32 of a buffer.
 *
 * @param {Buffer} buffer
 * @return {Boolean} true for matching CRC, false for no-match
 */
exports.validateCRC32 = validateCRC32
function validateCRC32(buffer, offset) {
  return readCRC32(buffer, offset) === calculateCRC32(buffer, offset)
}


var readCRC = exports.readCRC = function(buffer, props){
  switch (props.checkSumBits) {
    case 16: return buffer.readUInt16BE(props.checkSumOffset)
    case 32: return buffer.readUInt32BE(props.checkSumOffset)
    default: throw new Error("only 16 & 32 bit checkSumBits supported")
  }
}

var calculateCRC = exports.calculateCRC = function(buffer, props){
  switch (props.checkSumBits) {
    case 16: return calculateCRC16(buffer, props.checkSumOffset)
    case 32: return calculateCRC32(buffer, props.checkSumOffset)
    default: throw new Error("only 16 & 32 bit checkSumBits supported")
  }
}

var signCRC = exports.signCRC = function(buffer, props){
  switch (props.checkSumBits) {
    case 16: return signCRC16(buffer, props.checkSumOffset)
    case 32: return signCRC32(buffer, props.checkSumOffset)
    default: throw new Error("only 16 & 32 bit checkSumBits supported")
  }
}

var validateCRC = exports.validateCRC = function(buffer, props){
  return readCRC(buffer, props) === calculateCRC(buffer, props)
}