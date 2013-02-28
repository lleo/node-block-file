
var assert = require('assert')
  , crc16 = require('crc').buffer.crc16
  , fprintf = require('printf')
  , BLOCK_SIZE = require('./constants').BLOCK_SIZE


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
 * @returns {number} the CRC16
 */
var calculateCRC = exports.calculateCRC = function calculateCRC(buffer) {
  var buf = new Buffer(buffer.length)
  buffer.copy(buf)

  buf[0] = 0
  buf[1] = 0

  return crc16(buf)
}


/**
 * Read the CRC16 value from a buffer
 *
 * @param {Buffer} buffer
 * @returns {number} the CRC16
 */
var readCRC = exports.readCRC = function readCRC(buffer) {
  return buffer.readUInt16BE(0) //assuming crc16 is at beginning of buffer
}


/** This signs the CRC16 of the buffer
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
exports.signCRC = function signCRC(buffer) {
//  assert.equal(buffer.length, BLOCK_SIZE)
  buffer[0] = 0
  buffer[1] = 0
  buffer.writeUInt16BE(crc16(buffer), 0)
  return buffer
}


/**
 * Validate the CRC16 of a buffer.
 *
 * @param {Buffer} buffer
 * @returns {boolean} true for matching CRC, false for no-match
 */
exports.validateCRC = function validateCRC(buffer) {
//  assert.equal(buffer.length, BLOCK_SIZE)
  return readCRC(buffer) === calculateCRC(buffer)
}
