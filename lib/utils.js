
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


exports.bufferReadBit = function bufferReadBit(buffer, bit) {
  var byt, off, num, res

  byt = Math.floor(bit/8)
  off = bit % 8
  num = buffer.readUInt8(byt)

  res = num & 1<<off

  return res ? 1 : 0
  //return (buffer.readUInt8(Math.floor(bit/8)) & 1<<(bit % 8)) !== 0
} //end: readBit


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


exports.validateCRC = function validateCRC(buffer) {
  var crcVal, bufCrcVal
  assert.equal(buffer.length, BLOCK_SIZE)

  bufCrcVal = buffer.readUInt16BE(0)

  buffer[0] = 0
  buffer[1] = 0

  crcVal = crc16(buffer)

  return bufCrcVal === crcVal
}


exports.signCRC = function signCRC(buffer) {
  assert.equal(buffer.length, BLOCK_SIZE)

  buffer[0] = 0
  buffer[1] = 0

  var crcVal = crc16(buffer)
  buffer.writeUInt16BE(crcVal, 0)

  return buffer
}
