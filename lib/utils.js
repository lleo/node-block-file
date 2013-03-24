
var assert = require('assert')
  , crc16 = require('crc').buffer.crc16
  , crc32 = require('crc').buffer.crc32
  , fprintf = require('printf')


exports.printf = function(){
  var args = Array.prototype.slice.call(arguments)
  args.unshift(process.stdout)
  fprintf.apply(this, args)
}


exports.eprintf = function(){
  var args = Array.prototype.slice.call(arguments)
  args.unshift(process.stderr)
  fprintf.apply(this, args)
}


exports.xor = function xor(p,q) { return (p && !q) || (!p && q) }


/** Read the value (0|1) of a bit read from a buffer
 * @param {Buffer} buffer
 * @param {number} bit
 * @returns {number} 0 or 1
 */
exports.bufferReadBit = function bufferReadBit(buffer, bit) {
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
 * @param {number} bit index of bit from beginning of buffer
 * @param {boolean} value true/false value of bit to be set true=1 false=0
 * @returns {undefined}
 */
exports.bufferWriteBit = function bufferWriteBit(buffer, bit, value) {
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
 * @param {number} [offset=0] byte offset into buffer
 * @returns {number} the CRC16
 */
exports.calculateCRC16 = calculateCRC16
function calculateCRC16(buffer, offset) {
  if (!offset) offset = 0
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
 * @param {number} [offset=0] byte offset into buffer
 * @returns {number} the CRC16
 */
exports.readCRC16 = readCRC16
function readCRC16(buffer, offset) {
  if (!offset) offset = 0
  return buffer.readUInt16BE(offset)
}


/** This signs the CRC16 of the buffer
 * @param {Buffer} buffer
 * @param {number} [offset=0] byte offset into buffer
 * @returns {Buffer}
 */
exports.signCRC16 = signCRC16
function signCRC16(buffer, offset) {
  if (!offset) offset=0
  buffer[offset  ] = 0
  buffer[offset+1] = 0
  buffer.writeUInt16BE(crc16(buffer), 0)
  return buffer
}


/**
 * Validate the CRC16 of a buffer.
 *
 * @param {Buffer} buffer
 * @param {number} [offset=0] byte offset into buffer
 * @returns {boolean} true for matching CRC, false for no-match
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
 * @param {number} [offset=0] byte offset into buffer
 * @returns {number} the CRC32
 */
exports.calculateCRC32 = calculateCRC32
function calculateCRC32(buffer, offset) {
  if (!offset) offset = 0
  var buf = new Buffer(buffer.length)
  buffer.copy(buf)

  buf[offset  ] = 0
  buf[offset+1] = 0
  buf[offset+2] = 0
  buf[offset+3] = 0

  return crc32(buf)
}


/**
 * Read the CRC32 value from a buffer
 *
 * @param {Buffer} buffer
 * @param {number} [offset=0] byte offset into buffer
 * @returns {number} the CRC32
 */
exports.readCRC32 = readCRC32
function readCRC32(buffer, offset) {
  if (!offset) offset = 0
  return buffer.readUInt32BE(offset)
}


/** This signs the CRC32 of the buffer
 * @param {Buffer} buffer
 * @param {number} [offset=0] byte offset into buffer
 * @returns {Buffer}
 */
exports.signCRC32 = signCRC32
function signCRC32(buffer, offset) {
  if (!offset) offset=0
  buffer[offset  ] = 0
  buffer[offset+1] = 0
  buffer[offset+2] = 0
  buffer[offset+3] = 0
  buffer.writeUInt32BE(crc32(buffer), 0)
  return buffer
}


/**
 * Validate the CRC32 of a buffer.
 *
 * @param {Buffer} buffer
 * @returns {boolean} true for matching CRC, false for no-match
 */
exports.validateCRC32 = validateCRC32
function validateCRC32(buffer, offset) {
  return readCRC32(buffer, offset) === calculateCRC32(buffer, offset)
}
