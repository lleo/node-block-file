
var assert = require('chai').assert

var BLOCK_SIZE       = require('./constants').BLOCK_SIZE /*bytes*/
  , CRC16_OFFSET     = 0 /*bytes*/
  , BITFIELD_OFFSET  = 2 /*bytes*/ //crc16
  , BITFIELD_BEG     = BITFIELD_OFFSET*8 /*bits*/
  , BITFIELD_LEN     = (BLOCK_SIZE -2 /*crc16*/) * 8 /*bits*/
  , signCRC          = require('./utils').signCRC


exports = module.exports = Segment

/** Constructor for Segment of BpTree file
 *
 * @constructor
 * @param {Buffer} buffer
 * @param {function} fsmType
 *
 */
function Segment(buffer, fsmType) {
//  assert.strictEqual(segNum % 1, 0, "segNum % 1 === 0")
//  assert.operator(segNum, '>', 0)
  assert.ok( Buffer.isBuffer(buffer) )
  assert.strictEqual(buffer.length, BLOCK_SIZE)
  assert.strictEqual( typeof fsmType, 'function'
                    , "typeof fsmType === 'function'" )

  this.buffer = new Buffer(buffer.length)
  buffer.copy(this.buffer)

  this.fsm = new fsmType(this.buffer)

}

Segment.CRC16_OFFSET    = CRC16_OFFSET
Segment.BITFIELD_OFFSET = BITFIELD_OFFSET
Segment.BITFIELD_BEG    = BITFIELD_BEG
Segment.BITFIELD_LEN    = BITFIELD_LEN

Segment.prototype.sign = Segment__sign
function Segment__sign() {
  signCRC(this.buffer)
}

/** Allocate a handle; does not write to file
 *
 * @param {Number} numBlks reserve a number of blocks within this Segment
 * @returns {Handle}
 */
Segment.prototype.reserve = Segment__reserve
function Segment__reserve(numBlks) {
  var spanNum = numBlks-1

  this.fsm.alloc(spanNum)
}

/**
 *
 * @param {Handle} hdl
 * @returns {Boolean}
 */
Segment.prototype.release = Segment__release
function Segment__release(hdl) {

}

Segment.prototype.updateBuffer = Segment__updateBuffer
function Segment__updateBuffer(hdl, setBits) {

}
